import { Prisma, type Trip, type TripStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction, type Tx } from '../../lib/prisma.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { DAY_MS, HOUR_MS, tashkentToUtc } from '../../lib/time.js';
import { SEAT_HOLDING_STATUSES } from '../bookings/bookings.state.js';
import { getApprovedDriver, getDriverProfile } from '../drivers/drivers.service.js';
import { reviewPublicSelect, toReviewDto } from '../users/users.service.js';
import { toTripDto, tripInclude } from './trips.dto.js';
import type { CreateTripBody, SearchTripsQuery, UpdateTripBody } from './trips.schema.js';
import { normalizeSeatPrices, seatPriceList, takenSeats } from './seats.js';
import { TRIP_TRANSITIONS } from './trips.state.js';

const START_WINDOW_MS = 2 * HOUR_MS;
/** Spam e'lonlarga qarshi */
export const MAX_ACTIVE_TRIPS = 20;
const MAX_ADVANCE_MS = 30 * DAY_MS;

/** Viloyat bo'yicha qidirish: shahar tanlansa, shu viloyatdagi barcha tumanlar ham kiradi. */
export async function cityIds(cityId: string, exact: boolean): Promise<string[]> {
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city) throw new AppError('CITY_NOT_FOUND');
  if (exact) return [city.id];
  const all = await prisma.city.findMany({ where: { region: city.region }, select: { id: true } });
  return all.map((c) => c.id);
}

export async function assertCities(fromCityId: string, toCityId: string) {
  if (fromCityId === toCityId) throw new AppError('SAME_CITY');
  const count = await prisma.city.count({ where: { id: { in: [fromCityId, toCityId] } } });
  if (count !== 2) throw new AppError('CITY_NOT_FOUND');
}

function assertDeparture(departureAt: Date) {
  const now = Date.now();
  if (departureAt.getTime() <= now || departureAt.getTime() > now + MAX_ADVANCE_MS) {
    throw new AppError('TRIP_DEPARTURE_IN_PAST', { departureAt: 'now < departureAt <= now + 30d' });
  }
}

/** Haydovchining o'z safari (boshqasiniki bo'lsa 404). */
export async function ownTrip(userId: string, tripId: string) {
  const profile = await getDriverProfile(userId);
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.driverId !== profile.id) throw new AppError('TRIP_NOT_FOUND');
  return { trip, profile };
}

/**
 * Holatni atomik o'zgartiradi: faqat kutilgan holatda bo'lsa yangilanadi
 * (parallel so'rovlarda ikki marta o'tishning oldi olinadi).
 */
export async function transitionTrip(
  tx: Tx,
  trip: Pick<Trip, 'id' | 'status'>,
  to: TripStatus,
  data: Prisma.TripUpdateManyMutationInput = {},
) {
  assertTransition(TRIP_TRANSITIONS, trip.status, to);
  const res = await tx.trip.updateMany({ where: { id: trip.id, status: trip.status }, data: { ...data, status: to } });
  if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
}

async function loadDto(id: string) {
  return toTripDto(await prisma.trip.findUniqueOrThrow({ where: { id }, include: tripInclude }), { fullPlate: true });
}

export const tripsService = {
  async search(q: SearchTripsQuery) {
    const [fromIds, toIds] = await Promise.all([cityIds(q.from, q.exactCity), cityIds(q.to, q.exactCity)]);

    const now = new Date();
    let gte = now;
    let lt: Date | undefined;
    if (q.date) {
      const start = tashkentToUtc(q.date, q.timeFrom ?? '00:00');
      gte = start > now ? start : now;
      lt = q.timeTo ? new Date(tashkentToUtc(q.date, q.timeTo).getTime() + 60_000) : new Date(tashkentToUtc(q.date).getTime() + DAY_MS);
    }

    const where: Prisma.TripWhereInput = {
      status: 'SCHEDULED',
      fromCityId: { in: fromIds },
      toCityId: { in: toIds },
      departureAt: { gte, ...(lt ? { lt } : {}) },
      availableSeats: { gte: q.seats },
      pricePerSeat: { gte: q.minPrice, lte: q.maxPrice },
      ...(q.pickupFromHome !== undefined ? { pickupFromHome: q.pickupFromHome } : {}),
      ...(q.acceptsCargo !== undefined ? { acceptsCargo: q.acceptsCargo } : {}),
      driver: { user: { isBlocked: false } },
    };

    const orderBy: Prisma.TripOrderByWithRelationInput[] =
      q.sort === 'price'
        ? [{ pricePerSeat: 'asc' }, { departureAt: 'asc' }, { id: 'asc' }]
        : q.sort === 'rating'
          ? [{ driver: { ratingScore: 'desc' } }, { departureAt: 'asc' }, { id: 'asc' }]
          : [{ departureAt: 'asc' }, { id: 'asc' }];

    const rows = await prisma.trip.findMany({
      where,
      orderBy,
      include: tripInclude,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return { items: items.map((t) => toTripDto(t)), nextCursor };
  },

  async getById(id: string) {
    const trip = await prisma.trip.findUnique({ where: { id }, include: tripInclude });
    if (!trip) throw new AppError('TRIP_NOT_FOUND');
    const [reviews, holding] = await Promise.all([
      prisma.review.findMany({
        where: { targetUserId: trip.driver.userId, targetRole: 'DRIVER' },
        select: reviewPublicSelect,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // Yakunlangan safarda ham o'rinlar band ko'rinadi (aks holda tugagan safar "bo'sh" bo'lib qolardi)
      prisma.booking.findMany({ where: { tripId: id, status: { in: [...SEAT_HOLDING_STATUSES, 'COMPLETED'] } }, select: { seatNumbers: true } }),
    ]);
    return { trip, reviews: reviews.map(toReviewDto), takenSeats: takenSeats(holding) };
  },

  async create(userId: string, data: CreateTripBody) {
    const profile = await getApprovedDriver(userId);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle || vehicle.driverId !== profile.id) throw new AppError('VEHICLE_NOT_FOUND');
    if (vehicle.status !== 'APPROVED') throw new AppError('VEHICLE_NOT_APPROVED');
    await assertCities(data.fromCityId, data.toCityId);
    assertDeparture(data.departureAt);

    const totalSeats = data.totalSeats ?? vehicle.seats;
    if (totalSeats > vehicle.seats) throw new AppError('SEATS_EXCEED_VEHICLE');

    const active = await prisma.trip.count({ where: { driverId: profile.id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } });
    if (active >= MAX_ACTIVE_TRIPS) throw new AppError('TOO_MANY_ACTIVE_TRIPS');

    const { seatPrices: rawPrices, pricePerSeat: rawPrice, ...rest } = data;
    const prices = normalizeSeatPrices(totalSeats, rawPrices, rawPrice);
    const trip = await prisma.trip.create({
      data: {
        ...rest,
        pricePerSeat: prices.pricePerSeat,
        seatPrices: prices.seatPrices ?? Prisma.DbNull,
        driverId: profile.id,
        totalSeats,
        availableSeats: totalSeats,
      },
    });
    return loadDto(trip.id);
  },

  /**
   * Faqat SCHEDULED safar tahrirlanadi. Faol band qilishlar bo'lsa vaqt va narx o'zgarmaydi.
   * O'rinlar soni o'zgarsa, bo'sh o'rinlar farq bo'yicha atomik yangilanadi.
   */
  async update(userId: string, id: string, data: UpdateTripBody) {
    const { trip } = await ownTrip(userId, id);
    if (trip.status !== 'SCHEDULED') throw new AppError('INVALID_STATE_TRANSITION');

    const holding = await prisma.booking.count({ where: { tripId: id, status: { in: SEAT_HOLDING_STATUSES } } });
    const changesTerms =
      (data.departureAt && data.departureAt.getTime() !== trip.departureAt.getTime()) ||
      (data.pricePerSeat !== undefined && data.pricePerSeat !== trip.pricePerSeat) ||
      (data.seatPrices !== undefined && data.seatPrices.join() !== seatPriceList(trip).join());
    if (holding > 0 && changesTerms) throw new AppError('TRIP_HAS_BOOKINGS');
    if (data.departureAt) assertDeparture(data.departureAt);

    await transaction(async (tx) => {
      // Safar qatorini qulflash (tranzaksiyadagi birinchi so'rov — snapshot qulfdan keyin olinadi):
      // parallel band qilish o'rinlar soni o'zgarayotganda o'rin ololmaydi
      await tx.$queryRaw`SELECT id FROM Trip WHERE id = ${id} FOR UPDATE`;
      const { totalSeats, seatPrices: newPrices, pricePerSeat: newPrice, ...rest } = data;
      const seatsAfter = totalSeats ?? trip.totalSeats;
      if (totalSeats !== undefined && totalSeats !== trip.totalSeats) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: trip.vehicleId } });
        if (totalSeats > vehicle.seats) throw new AppError('SEATS_EXCEED_VEHICLE');
        // Band qilingan o'rin raqami yangi sondan katta bo'lsa — kamaytirib bo'lmaydi
        const taken = takenSeats(
          await tx.booking.findMany({ where: { tripId: id, status: { in: SEAT_HOLDING_STATUSES } }, select: { seatNumbers: true } }),
        );
        if (taken.some((n) => n > totalSeats)) throw new AppError('SEATS_BELOW_BOOKED');
        const delta = totalSeats - trip.totalSeats;
        // Band qilingan o'rinlardan kam qilib bo'lmaydi: availableSeats + delta >= 0
        const res = await tx.trip.updateMany({
          where: { id, status: 'SCHEDULED', totalSeats: trip.totalSeats, availableSeats: { gte: -delta } },
          data: { totalSeats, availableSeats: { increment: delta } },
        });
        if (res.count === 0) throw new AppError('SEATS_BELOW_BOOKED');
      }
      // Narxlar: yangi ro'yxat, yagona narx yoki (faqat o'rinlar soni o'zgarsa) eskisini qisqartirish/to'ldirish
      let prices: { seatPrices: number[] | null; pricePerSeat: number } | undefined;
      if (newPrices !== undefined) prices = normalizeSeatPrices(seatsAfter, newPrices, undefined);
      else if (newPrice !== undefined) prices = { seatPrices: null, pricePerSeat: newPrice };
      else if (seatsAfter !== trip.totalSeats) {
        const old = seatPriceList(trip);
        prices = normalizeSeatPrices(seatsAfter, Array.from({ length: seatsAfter }, (_, i) => old[i] ?? trip.pricePerSeat), undefined);
      }
      const update: Prisma.TripUpdateInput = { ...rest };
      if (prices) {
        update.pricePerSeat = prices.pricePerSeat;
        update.seatPrices = prices.seatPrices ?? Prisma.DbNull;
      }
      if (Object.keys(update).length) await tx.trip.update({ where: { id }, data: update });
    });
    return loadDto(id);
  },

  /** Bekor qilish: barcha faol band qilishlar ham bekor bo'ladi. */
  async cancel(userId: string, id: string) {
    const { trip } = await ownTrip(userId, id);
    const affected = await prisma.booking.findMany({
      where: { tripId: id, status: { in: SEAT_HOLDING_STATUSES } },
      select: { id: true, passengerId: true },
    });
    await transaction(async (tx) => {
      await transitionTrip(tx, trip, 'CANCELLED');
      await tx.booking.updateMany({
        where: { tripId: id, status: { in: SEAT_HOLDING_STATUSES } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });
    return { trip: await loadDto(id), affectedBookings: affected };
  },

  /** Boshlash: jo'nashdan 2 soat oldin mumkin. Tasdiqlanmagan so'rovlar rad etiladi. */
  async start(userId: string, id: string) {
    const { trip } = await ownTrip(userId, id);
    if (trip.status === 'SCHEDULED' && trip.departureAt.getTime() - Date.now() > START_WINDOW_MS) {
      throw new AppError('TRIP_START_TOO_EARLY');
    }
    const rejected = await prisma.booking.findMany({
      where: { tripId: id, status: 'PENDING' },
      select: { id: true, passengerId: true, seats: true },
    });
    await transaction(async (tx) => {
      await transitionTrip(tx, trip, 'IN_PROGRESS');
      const res = await tx.booking.updateMany({ where: { tripId: id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      if (res.count) {
        const seats = rejected.reduce((s, b) => s + b.seats, 0);
        await tx.trip.update({ where: { id }, data: { availableSeats: { increment: seats } } });
      }
    });
    return { trip: await loadDto(id), affectedBookings: rejected.map(({ id: bid, passengerId }) => ({ id: bid, passengerId })) };
  },

  /** Yakunlash: tasdiqlangan band qilishlar COMPLETED, haydovchi safarlar soni +1. */
  async complete(userId: string, id: string) {
    const { trip, profile } = await ownTrip(userId, id);
    const affected = await prisma.booking.findMany({
      where: { tripId: id, status: 'CONFIRMED' },
      select: { id: true, passengerId: true },
    });
    await completeTrip(trip, profile.id);
    return { trip: await loadDto(id), affectedBookings: affected };
  },

  async listMine(userId: string, status: 'active' | 'completed' | 'cancelled', limit: number, cursor?: string) {
    const profile = await getDriverProfile(userId);
    const statuses: TripStatus[] =
      status === 'active' ? ['SCHEDULED', 'IN_PROGRESS'] : status === 'completed' ? ['COMPLETED'] : ['CANCELLED'];
    const rows = await prisma.trip.findMany({
      where: { driverId: profile.id, status: { in: statuses } },
      include: {
        ...tripInclude,
        _count: { select: { bookings: { where: { status: 'PENDING' } } } },
      },
      orderBy: [{ departureAt: status === 'active' ? 'asc' : 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return {
      items: items.map((t) => ({ ...toTripDto(t, { fullPlate: true }), pendingBookings: t._count.bookings })),
      nextCursor,
    };
  },
};

/** Cron ham ishlatadi. */
export async function completeTrip(trip: Pick<Trip, 'id' | 'status'>, driverId: string) {
  await transaction(async (tx) => {
    await transitionTrip(tx, trip, 'COMPLETED', { completedAt: new Date() });
    await tx.booking.updateMany({ where: { tripId: trip.id, status: 'CONFIRMED' }, data: { status: 'COMPLETED' } });
    await tx.booking.updateMany({
      where: { tripId: trip.id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    await tx.driverProfile.update({ where: { id: driverId }, data: { tripsCount: { increment: 1 } } });
  });
}
