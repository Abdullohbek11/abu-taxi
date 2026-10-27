import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { DAY_MS, TASHKENT_OFFSET_MIN } from '../../lib/time.js';
import { toTripDto, tripInclude } from '../trips/trips.dto.js';
import { getDriverProfile } from './drivers.service.js';

/** Toshkent bo'yicha bugungi sana (YYYY-MM-DD) va kun boshining UTC vaqti. */
function tashkentDay(offsetDays = 0, now = new Date()) {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MIN * 60_000 + offsetDays * DAY_MS);
  const date = local.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - TASHKENT_OFFSET_MIN * 60_000);
  return { date, start };
}

// Prisma DateTime MySQL'da UTC DATETIME sifatida saqlanadi. Toshkent sanasiga o'tkazish (UTC+5, yozgi vaqt yo'q).
// Raqamli siljish ishlatiladi — MySQL vaqt zonalari jadvali yuklanmagan bo'lsa ham ishlaydi.
const tashkentDate = (col: string) => Prisma.raw(`DATE(CONVERT_TZ(${col}, '+00:00', '+05:00'))`);

/** MySQL DATE ustuni drayverga qarab Date yoki satr bo'lib keladi. */
const dayKey = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/**
 * Haydovchi paneli: bugungi safarlar, oxirgi 7 kunlik daromad (kunlar kesimida), umumiy ko'rsatkichlar.
 * Daromad: yakunlangan band qilishlar + yetkazilgan yuklar (qabul qilingan taklif narxi).
 */
export async function driverStats(userId: string) {
  const profile = await getDriverProfile(userId);
  const today = tashkentDay(0);
  const tomorrow = tashkentDay(1);
  const weekStart = tashkentDay(-6);

  const [todayTrips, passengerRows, cargoRows, counts] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId: profile.id, departureAt: { gte: today.start, lt: tomorrow.start }, status: { not: 'CANCELLED' } },
      include: tripInclude,
      orderBy: { departureAt: 'asc' },
    }),
    prisma.$queryRaw<{ day: Date | string; amount: bigint }[]>`
      SELECT ${tashkentDate('t.departureAt')} AS day, CAST(COALESCE(SUM(b.totalPrice), 0) AS SIGNED) AS amount
      FROM Trip t JOIN Booking b ON b.tripId = t.id
      WHERE t.driverId = ${profile.id} AND t.status = 'COMPLETED' AND b.status = 'COMPLETED'
        AND t.departureAt >= ${weekStart.start}
      GROUP BY day`,
    prisma.$queryRaw<{ day: Date | string; amount: bigint }[]>`
      SELECT ${tashkentDate('c.deliveredAt')} AS day, CAST(COALESCE(SUM(o.price), 0) AS SIGNED) AS amount
      FROM CargoOffer o JOIN CargoRequest c ON c.id = o.cargoRequestId
      WHERE o.driverId = ${profile.id} AND o.status = 'ACCEPTED' AND c.status = 'DELIVERED'
        AND c.deliveredAt >= ${weekStart.start}
      GROUP BY day`,
    prisma.trip.groupBy({ by: ['status'], where: { driverId: profile.id }, _count: true }),
  ]);

  const byDay = (rows: { day: Date | string; amount: bigint }[]) => new Map(rows.map((r) => [dayKey(r.day), Number(r.amount)]));
  const passengers = byDay(passengerRows);
  const cargo = byDay(cargoRows);

  const weeklyEarnings = Array.from({ length: 7 }, (_, i) => {
    const { date } = tashkentDay(i - 6);
    const p = passengers.get(date) ?? 0;
    const c = cargo.get(date) ?? 0;
    return { date, passengers: p, cargo: c, total: p + c };
  });
  const tripCounts = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return {
    today: {
      date: today.date,
      trips: todayTrips.map((t) => ({
        ...toTripDto(t, { fullPlate: true }),
        bookedSeats: t.totalSeats - t.availableSeats,
      })),
    },
    weeklyEarnings,
    weeklyTotal: weeklyEarnings.reduce((s, d) => s + d.total, 0),
    trips: {
      scheduled: tripCounts.SCHEDULED ?? 0,
      inProgress: tripCounts.IN_PROGRESS ?? 0,
      completed: tripCounts.COMPLETED ?? 0,
      cancelled: tripCounts.CANCELLED ?? 0,
      total: profile.tripsCount,
    },
    rating: { avg: Number(profile.ratingAvg), count: profile.ratingCount },
  };
}
