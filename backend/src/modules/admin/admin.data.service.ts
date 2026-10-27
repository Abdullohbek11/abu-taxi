import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { displayName, photoList } from '../../lib/format.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { DAY_MS } from '../../lib/time.js';
import { recalcRating } from '../reviews/reviews.service.js';
import { toMeDto } from '../users/users.service.js';
import { adminStats } from './admin.stats.js';
import type { AdminListQuery, ExportEntity } from './admin.schema.js';

const userBrief = { id: true, phone: true, firstName: true, lastName: true, telegramUsername: true, isBlocked: true, role: true } satisfies Prisma.UserSelect;
const city = { select: { nameUz: true, nameRu: true, region: true } } satisfies Prisma.CityDefaultArgs;
const brief = (u: Prisma.UserGetPayload<{ select: typeof userBrief }>) => ({ ...u, name: displayName(u.firstName, u.lastName) });

/** Kunlik qatorlar (Toshkent vaqti bo'yicha), oxirgi 30 kun — bo'sh kunlar 0 bilan. */
async function daily(table: 'User' | 'Booking' | 'RideRequest' | 'Trip' | 'CargoRequest', since: Date) {
  const rows = await prisma.$queryRaw<{ d: Date | string; n: bigint }[]>(
    Prisma.sql`SELECT DATE(DATE_ADD(createdAt, INTERVAL 5 HOUR)) AS d, COUNT(*) AS n FROM ${Prisma.raw(`\`${table}\``)} WHERE createdAt >= ${since} GROUP BY d ORDER BY d`,
  );
  const map = new Map(rows.map((r) => [typeof r.d === 'string' ? r.d.slice(0, 10) : r.d.toISOString().slice(0, 10), Number(r.n)]));
  const out: { date: string; count: number }[] = [];
  for (let t = since.getTime() + 5 * 3600_000; t <= Date.now() + 5 * 3600_000; t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

/** CSV katagi: Excel formula injeksiyasidan himoya (= + - @ bilan boshlansa — oldiga ' qo'yiladi). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM — Excel o'zbek/rus harflarini to'g'ri ochishi uchun
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const adminDataService = {
  /** Bosh sahifa: umumiy ko'rsatkichlar + 30 kunlik dinamika + top yo'nalishlar va haydovchilar. */
  async overview() {
    const since = new Date(Date.now() - 29 * DAY_MS - ((Date.now() + 5 * 3600_000) % DAY_MS));
    const [base, rideByStatus, reviewsAgg, users30, bookings30, rides30, trips30, topRoutes, topDrivers, admins] = await Promise.all([
      adminStats(),
      prisma.rideRequest.groupBy({ by: ['status'], _count: true }),
      prisma.review.aggregate({ _avg: { rating: true }, _count: true }),
      daily('User', since),
      daily('Booking', since),
      daily('RideRequest', since),
      daily('Trip', since),
      prisma.$queryRaw<{ fromRegion: string; toRegion: string; trips: bigint }[]>`
        SELECT f.region AS fromRegion, t.region AS toRegion, COUNT(*) AS trips
        FROM Trip tr JOIN City f ON f.id = tr.fromCityId JOIN City t ON t.id = tr.toCityId
        WHERE tr.createdAt >= ${new Date(Date.now() - 90 * DAY_MS)}
        GROUP BY f.region, t.region ORDER BY trips DESC LIMIT 8`,
      prisma.driverProfile.findMany({
        where: { status: 'APPROVED' },
        orderBy: [{ ratingScore: 'desc' }, { tripsCount: 'desc' }],
        take: 5,
        include: { user: { select: userBrief } },
      }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
    ]);
    return {
      ...base,
      admins,
      rideRequests: Object.fromEntries(rideByStatus.map((r) => [r.status, r._count])),
      reviews: { count: reviewsAgg._count, avg: Number((reviewsAgg._avg.rating ?? 0).toFixed(2)) },
      daily: { users: users30, bookings: bookings30, rideRequests: rides30, trips: trips30 },
      topRoutes: topRoutes.map((r) => ({ from: r.fromRegion, to: r.toRegion, trips: Number(r.trips) })),
      topDrivers: topDrivers.map((d) => ({
        id: d.id,
        user: brief(d.user),
        rating: Number(d.ratingAvg),
        ratingCount: d.ratingCount,
        tripsCount: d.tripsCount,
      })),
    };
  },

  /** Foydalanuvchining to'liq kartasi: profil, haydovchilik, safarlar, bronlar, yuklar, so'rovlar, sharhlar, sessiyalar, jurnal. */
  async userDetail(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        driverProfile: { include: { vehicles: true, documents: { select: { id: true, type: true, status: true, createdAt: true } } } },
      },
    });
    if (!user) throw new AppError('USER_NOT_FOUND');
    const driverId = user.driverProfile?.id;
    const [bookings, trips, cargo, rides, reviewsIn, reviewsOut, sessions, auditRows, counts] = await Promise.all([
      prisma.booking.findMany({
        where: { passengerId: id },
        include: { trip: { include: { fromCity: city, toCity: city } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      driverId
        ? prisma.trip.findMany({ where: { driverId }, include: { fromCity: city, toCity: city }, orderBy: { departureAt: 'desc' }, take: 30 })
        : Promise.resolve([]),
      prisma.cargoRequest.findMany({ where: { senderId: id }, include: { fromCity: city, toCity: city }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.rideRequest.findMany({
        where: { OR: [{ passengerId: id }, ...(driverId ? [{ driverId }] : [])] },
        include: { fromCity: city, toCity: city },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.review.findMany({ where: { targetUserId: id }, include: { author: { select: userBrief } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.review.findMany({ where: { authorId: id }, include: { targetUser: { select: userBrief } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.auditLog.findMany({
        where: { targetId: { in: [id, ...(driverId ? [driverId] : [])] } },
        include: { admin: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      Promise.all([
        prisma.booking.count({ where: { passengerId: id } }),
        driverId ? prisma.trip.count({ where: { driverId } }) : 0,
        prisma.cargoRequest.count({ where: { senderId: id } }),
        // Yo'lovchi sifatida qoldirgan va haydovchi sifatida olgan so'rovlar (ro'yxat bilan bir xil)
        prisma.rideRequest.count({ where: { OR: [{ passengerId: id }, ...(driverId ? [{ driverId }] : [])] } }),
        prisma.booking.count({ where: { passengerId: id, cancelledLate: true } }),
      ]),
    ]);
    const route = (r: { fromCity: { nameUz: string }; toCity: { nameUz: string } }) => `${r.fromCity.nameUz} → ${r.toCity.nameUz}`;
    return {
      user: {
        ...toMeDto(user),
        hasPassword: !!user.passwordHash,
        clientRating: { avg: Number(user.clientRatingAvg), count: user.clientRatingCount },
        activeSessions: sessions,
      },
      driver: user.driverProfile
        ? {
            id: user.driverProfile.id,
            status: user.driverProfile.status,
            rejectReason: user.driverProfile.rejectReason,
            rating: Number(user.driverProfile.ratingAvg),
            ratingCount: user.driverProfile.ratingCount,
            tripsCount: user.driverProfile.tripsCount,
            subscriptionUntil: user.driverProfile.subscriptionUntil,
            vehicles: user.driverProfile.vehicles.map((v) => ({ ...v, photos: photoList(v.photos) })),
            documents: user.driverProfile.documents,
          }
        : null,
      counts: { bookings: counts[0], trips: counts[1], cargo: counts[2], rideRequests: counts[3], lateCancellations: counts[4] },
      bookings: bookings.map((b) => ({ id: b.id, status: b.status, seats: b.seats, totalPrice: b.totalPrice, createdAt: b.createdAt, route: route(b.trip), departureAt: b.trip.departureAt, cancelledLate: b.cancelledLate })),
      trips: trips.map((t) => ({ id: t.id, status: t.status, route: route(t), departureAt: t.departureAt, totalSeats: t.totalSeats, availableSeats: t.availableSeats, pricePerSeat: t.pricePerSeat })),
      cargo: cargo.map((c) => ({ id: c.id, status: c.status, type: c.type, weightKg: c.weightKg, route: route(c), date: c.date, offeredPrice: c.offeredPrice })),
      rideRequests: rides.map((r) => ({ id: r.id, status: r.status, route: route(r), date: r.date, seats: r.seats, pricePerSeat: r.pricePerSeat, asDriver: r.passengerId !== id })),
      reviewsReceived: reviewsIn.map((r) => ({ id: r.id, rating: r.rating, text: r.text, role: r.targetRole, createdAt: r.createdAt, author: brief(r.author) })),
      reviewsWritten: reviewsOut.map((r) => ({ id: r.id, rating: r.rating, text: r.text, role: r.targetRole, createdAt: r.createdAt, target: brief(r.targetUser) })),
      audit: auditRows.map((a) => ({ id: a.id, action: a.action, meta: a.meta, ip: a.ip, createdAt: a.createdAt, admin: displayName(a.admin.firstName, a.admin.lastName) })),
    };
  },

  async listTrips(q: AdminListQuery) {
    const rows = await prisma.trip.findMany({
      where: {
        ...(q.status ? { status: q.status as Prisma.EnumTripStatusFilter['equals'] } : {}),
        ...(q.q ? { OR: [{ driver: { user: { phone: { contains: q.q } } } }, { driver: { user: { firstName: { contains: q.q } } } }, { vehicle: { plateNumber: { contains: q.q } } }] } : {}),
      },
      include: { fromCity: city, toCity: city, driver: { include: { user: { select: userBrief } } }, vehicle: { select: { model: true, plateNumber: true } }, _count: { select: { bookings: true } } },
      orderBy: [{ departureAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((t) => ({
        id: t.id,
        status: t.status,
        from: t.fromCity,
        to: t.toCity,
        departureAt: t.departureAt,
        totalSeats: t.totalSeats,
        availableSeats: t.availableSeats,
        pricePerSeat: t.pricePerSeat,
        bookings: t._count.bookings,
        driver: brief(t.driver.user),
        vehicle: t.vehicle,
      })),
      nextCursor,
    };
  },

  async listBookings(q: AdminListQuery) {
    const rows = await prisma.booking.findMany({
      where: {
        ...(q.status ? { status: q.status as Prisma.EnumBookingStatusFilter['equals'] } : {}),
        ...(q.q ? { OR: [{ passenger: { phone: { contains: q.q } } }, { passenger: { firstName: { contains: q.q } } }] } : {}),
      },
      include: { passenger: { select: userBrief }, trip: { include: { fromCity: city, toCity: city, driver: { include: { user: { select: userBrief } } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((b) => ({
        id: b.id,
        status: b.status,
        seats: b.seats,
        totalPrice: b.totalPrice,
        cancelledLate: b.cancelledLate,
        createdAt: b.createdAt,
        departureAt: b.trip.departureAt,
        from: b.trip.fromCity,
        to: b.trip.toCity,
        passenger: brief(b.passenger),
        driver: brief(b.trip.driver.user),
      })),
      nextCursor,
    };
  },

  async listCargo(q: AdminListQuery) {
    const rows = await prisma.cargoRequest.findMany({
      where: {
        ...(q.status ? { status: q.status as Prisma.EnumCargoStatusFilter['equals'] } : {}),
        ...(q.q ? { OR: [{ sender: { phone: { contains: q.q } } }, { sender: { firstName: { contains: q.q } } }] } : {}),
      },
      include: { sender: { select: userBrief }, fromCity: city, toCity: city, _count: { select: { offers: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((c) => ({
        id: c.id,
        status: c.status,
        type: c.type,
        weightKg: c.weightKg,
        date: c.date,
        offeredPrice: c.offeredPrice,
        from: c.fromCity,
        to: c.toCity,
        offers: c._count.offers,
        createdAt: c.createdAt,
        sender: brief(c.sender),
      })),
      nextCursor,
    };
  },

  async listReviews(q: AdminListQuery) {
    const rows = await prisma.review.findMany({
      where: {
        ...(q.status === 'LOW' ? { rating: { lte: 2 } } : {}),
        ...(q.q ? { OR: [{ text: { contains: q.q } }, { targetUser: { phone: { contains: q.q } } }, { author: { phone: { contains: q.q } } }] } : {}),
      },
      include: { author: { select: userBrief }, targetUser: { select: userBrief } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((r) => ({ id: r.id, rating: r.rating, text: r.text, role: r.targetRole, createdAt: r.createdAt, author: brief(r.author), target: brief(r.targetUser) })),
      nextCursor,
    };
  },

  /** Moderatsiya: haqoratli yoki soxta sharhni o'chirish — reyting qayta hisoblanadi. */
  async deleteReview(id: string) {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw new AppError('NOT_FOUND');
    await transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await recalcRating(tx, review.targetUserId, review.targetRole);
    });
    return { deleted: true, targetUserId: review.targetUserId, rating: review.rating, text: review.text };
  },

  /** CSV eksport (Excel'da ochiladi). Har eksport jurnalga yoziladi. 5 000 qatorgacha. */
  async exportCsv(entity: ExportEntity): Promise<{ filename: string; csv: string; rows: number }> {
    const take = 5000;
    const stamp = new Date().toISOString().slice(0, 10);
    if (entity === 'users') {
      const rows = await prisma.user.findMany({ include: { driverProfile: { select: { status: true, ratingAvg: true, ratingCount: true, tripsCount: true } } }, orderBy: { createdAt: 'desc' }, take });
      return {
        filename: `abutax-users-${stamp}.csv`,
        rows: rows.length,
        csv: toCsv(
          ['id', 'telefon', 'ism', 'familiya', 'telegram', 'rol', 'til', 'bloklangan', 'blok sababi', 'haydovchi holati', 'haydovchi reytingi', 'sharhlar', 'safarlar', 'mijoz reytingi', "ro'yxatdan o'tgan"],
          rows.map((u) => [u.id, u.phone, u.firstName, u.lastName, u.telegramUsername, u.role, u.lang, u.isBlocked ? 'ha' : "yo'q", u.blockReason, u.driverProfile?.status, u.driverProfile ? Number(u.driverProfile.ratingAvg) : '', u.driverProfile?.ratingCount, u.driverProfile?.tripsCount, u.clientRatingCount ? Number(u.clientRatingAvg) : '', u.createdAt]),
        ),
      };
    }
    if (entity === 'trips') {
      const rows = await prisma.trip.findMany({ include: { fromCity: city, toCity: city, driver: { include: { user: { select: userBrief } } }, vehicle: true }, orderBy: { departureAt: 'desc' }, take });
      return {
        filename: `abutax-trips-${stamp}.csv`,
        rows: rows.length,
        csv: toCsv(
          ['id', 'holat', 'qayerdan', 'qayerga', "jo'nash", 'haydovchi', 'telefon', 'mashina', 'raqam', "o'rinlar", "bo'sh", 'narx'],
          rows.map((t) => [t.id, t.status, t.fromCity.nameUz, t.toCity.nameUz, t.departureAt, displayName(t.driver.user.firstName, t.driver.user.lastName), t.driver.user.phone, t.vehicle.model, t.vehicle.plateNumber, t.totalSeats, t.availableSeats, t.pricePerSeat]),
        ),
      };
    }
    if (entity === 'bookings') {
      const rows = await prisma.booking.findMany({ include: { passenger: { select: userBrief }, trip: { include: { fromCity: city, toCity: city } } }, orderBy: { createdAt: 'desc' }, take });
      return {
        filename: `abutax-bookings-${stamp}.csv`,
        rows: rows.length,
        csv: toCsv(
          ['id', 'holat', "yo'lovchi", 'telefon', 'qayerdan', 'qayerga', "jo'nash", "o'rin", 'summa', 'kech bekor', 'yaratilgan'],
          rows.map((b) => [b.id, b.status, displayName(b.passenger.firstName, b.passenger.lastName), b.passenger.phone, b.trip.fromCity.nameUz, b.trip.toCity.nameUz, b.trip.departureAt, b.seats, b.totalPrice, b.cancelledLate ? 'ha' : '', b.createdAt]),
        ),
      };
    }
    if (entity === 'cargo') {
      const rows = await prisma.cargoRequest.findMany({ include: { sender: { select: userBrief }, fromCity: city, toCity: city }, orderBy: { createdAt: 'desc' }, take });
      return {
        filename: `abutax-cargo-${stamp}.csv`,
        rows: rows.length,
        csv: toCsv(
          ['id', 'holat', 'turi', 'kg', "jo'natuvchi", 'telefon', 'qayerdan', 'qayerga', 'sana', 'taklif narxi', 'izoh'],
          rows.map((c) => [c.id, c.status, c.type, c.weightKg, displayName(c.sender.firstName, c.sender.lastName), c.sender.phone, c.fromCity.nameUz, c.toCity.nameUz, c.date, c.offeredPrice, c.description]),
        ),
      };
    }
    const rows = await prisma.rideRequest.findMany({ include: { passenger: { select: userBrief }, fromCity: city, toCity: city }, orderBy: { createdAt: 'desc' }, take });
    return {
      filename: `abutax-ride-requests-${stamp}.csv`,
      rows: rows.length,
      csv: toCsv(
        ['id', 'holat', "yo'lovchi", 'telefon', 'qayerdan', 'qayerga', 'sana', 'kishi', 'taklif', 'haydovchi', 'haydovchi tel', 'mashina', 'narx', 'izoh'],
        rows.map((r) => [r.id, r.status, displayName(r.passenger.firstName, r.passenger.lastName), r.passenger.phone, r.fromCity.nameUz, r.toCity.nameUz, r.date, r.seats, r.offeredPrice, r.driverName, r.driverPhone, r.carModel, r.pricePerSeat, r.note]),
      ),
    };
  },
};
