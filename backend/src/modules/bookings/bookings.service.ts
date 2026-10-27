import { Prisma, type Booking, type BookingStatus } from '@prisma/client';
import { CONTACT_BOOKING_STATUSES, toContact } from '../../lib/contact.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction, type Tx } from '../../lib/prisma.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { HOUR_MS } from '../../lib/time.js';
import { toTripDto, tripInclude } from '../trips/trips.dto.js';
import { pickSeats, seatNumberList, seatPriceList, takenSeats } from '../trips/seats.js';
import { getDriverProfile } from '../drivers/drivers.service.js';
import { ownTrip } from '../trips/trips.service.js';
import { clientRatingSelect, toPublicUserDto } from '../users/users.service.js';
import { assertDriverSubscription } from '../billing/billing.service.js';
import type { CreateBookingBody } from './bookings.schema.js';
import { BOOKING_TRANSITIONS, SEAT_HOLDING_STATUSES } from './bookings.state.js';

/** Jo'nashga shundan kam vaqt qolganda bekor qilish "kech" hisoblanadi. */
export const LATE_CANCEL_MS = 2 * HOUR_MS;

/**
 * O'rinlarni "egallab qo'yish" hujumiga qarshi: bitta foydalanuvchida bir vaqtda
 * ko'pi bilan shuncha tasdiqlanmagan band qilish (jami faol — MAX_ACTIVE_BOOKINGS).
 * Tasdiqlanmagan band qilishlar PENDING_BOOKING_TTL_MS dan keyin cron orqali bekor qilinadi.
 */
export const MAX_PENDING_BOOKINGS = 3;
export const MAX_ACTIVE_BOOKINGS = 10;
export const PENDING_BOOKING_TTL_MS = 3 * HOUR_MS;

const passengerBookingInclude = {
  trip: {
    include: {
      ...tripInclude,
      driver: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, phone: true, telegramUsername: true } },
        },
      },
    },
  },
  reviews: { select: { authorId: true } },
} satisfies Prisma.BookingInclude;

type PassengerBooking = Prisma.BookingGetPayload<{ include: typeof passengerBookingInclude }>;

function baseDto(b: Booking) {
  return {
    id: b.id,
    tripId: b.tripId,
    seats: b.seats,
    seatNumbers: seatNumberList(b.seatNumbers),
    totalPrice: b.totalPrice,
    pickupAddress: b.pickupAddress,
    pickupLat: b.pickupLat,
    pickupLng: b.pickupLng,
    dropoffAddress: b.dropoffAddress,
    dropoffLat: b.dropoffLat,
    dropoffLng: b.dropoffLng,
    comment: b.comment,
    status: b.status,
    cancelledAt: b.cancelledAt,
    cancelledLate: b.cancelledLate,
    createdAt: b.createdAt,
  };
}

/** Yo'lovchi ko'rinishi: tasdiqlangandan keyin haydovchi kontakti va to'liq davlat raqami. */
export function toPassengerBookingDto(b: PassengerBooking) {
  const open = CONTACT_BOOKING_STATUSES.has(b.status);
  return {
    ...baseDto(b),
    trip: toTripDto(b.trip, { fullPlate: open }),
    contact: open ? toContact(b.trip.driver.user) : null,
    // Sahifa yangilansa ham "Sharh qoldirish" qayta chiqmasligi uchun
    reviewed: b.reviews.some((r) => r.authorId === b.passengerId),
  };
}

/**
 * Holatni atomik o'zgartiradi. Kutilgan holat parallel so'rov tomonidan o'zgartirilgan bo'lsa — 409.
 */
async function transitionBooking(tx: Tx, b: Pick<Booking, 'id' | 'status'>, to: BookingStatus, data: Prisma.BookingUpdateManyMutationInput = {}) {
  assertTransition(BOOKING_TRANSITIONS, b.status, to);
  const res = await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { ...data, status: to } });
  if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
}

async function loadPassengerDto(id: string) {
  return toPassengerBookingDto(await prisma.booking.findUniqueOrThrow({ where: { id }, include: passengerBookingInclude }));
}

/** Haydovchi o'z safaridagi band qilishni boshqaradi. */
async function driverBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError('BOOKING_NOT_FOUND');
  try {
    const { trip } = await ownTrip(userId, booking.tripId);
    return { booking, trip };
  } catch {
    throw new AppError('BOOKING_NOT_FOUND');
  }
}

export const bookingsService = {
  /**
   * O'rin band qilish. Safar qatori FOR UPDATE bilan qulflanadi — bitta o'rinni ikki kishi ololmaydi;
   * qo'shimcha himoya: `availableSeats >= seats` sharti bilan atomik UPDATE.
   * O'rinlar ko'rsatilmasa, eng kichik raqamli bo'sh o'rinlar tanlanadi. Narx — tanlangan o'rinlar narxi yig'indisi.
   */
  async create(userId: string, data: CreateBookingBody) {
    const trip = await prisma.trip.findUnique({ where: { id: data.tripId }, include: { driver: true } });
    if (!trip) throw new AppError('TRIP_NOT_FOUND');
    if (trip.driver.userId === userId) throw new AppError('CANNOT_BOOK_OWN_TRIP');

    const { seats, seatNumbers, ...rest } = data;
    const bookingId = await transaction(async (tx) => {
      // Foydalanuvchi qatorini qulflash: bitta foydalanuvchining band qilishlari ketma-ket bajariladi —
      // parallel so'rovlar limitni ham, "bitta safarda bitta faol band qilish" qoidasini ham aylanib o'ta olmaydi
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      // Safar qatorini ham qulflash (tartib: User → Trip). Muhim: oddiy SELECT'lardan OLDIN —
      // InnoDB REPEATABLE READ snapshot'i birinchi oddiy o'qishda olinadi; qulfdan keyin olinsa,
      // bizdan oldin shu safarga yozgan tranzaksiyalarning band qilgan o'rinlari ko'rinadi.
      await tx.$queryRaw`SELECT id FROM Trip WHERE id = ${trip.id} FOR UPDATE`;
      const [pending, active, duplicate] = await Promise.all([
        tx.booking.count({ where: { passengerId: userId, status: 'PENDING' } }),
        tx.booking.count({ where: { passengerId: userId, status: { in: SEAT_HOLDING_STATUSES } } }),
        tx.booking.count({ where: { passengerId: userId, tripId: trip.id, status: { in: SEAT_HOLDING_STATUSES } } }),
      ]);
      if (duplicate > 0) throw new AppError('BOOKING_ALREADY_EXISTS');
      if (pending >= MAX_PENDING_BOOKINGS || active >= MAX_ACTIVE_BOOKINGS) throw new AppError('TOO_MANY_ACTIVE_BOOKINGS');

      const fresh = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      if (fresh.status !== 'SCHEDULED' || fresh.departureAt <= new Date()) throw new AppError('TRIP_NOT_BOOKABLE');
      const taken = takenSeats(
        await tx.booking.findMany({ where: { tripId: trip.id, status: { in: SEAT_HOLDING_STATUSES } }, select: { seatNumbers: true } }),
      );
      const count = seatNumbers?.length ?? seats!;
      const chosen = pickSeats(fresh.totalSeats, taken, seatNumbers, count);
      const prices = seatPriceList(fresh);
      const totalPrice = chosen.reduce((sum, n) => sum + prices[n - 1]!, 0);

      const dec = await tx.trip.updateMany({
        where: { id: trip.id, status: 'SCHEDULED', departureAt: { gt: new Date() }, availableSeats: { gte: count } },
        data: { availableSeats: { decrement: count } },
      });
      if (dec.count === 0) throw new AppError('TRIP_FULL');
      const booking = await tx.booking.create({
        data: { ...rest, seats: count, seatNumbers: chosen, passengerId: userId, totalPrice },
      });
      return booking.id;
    });
    return { booking: await loadPassengerDto(bookingId), driverUserId: trip.driver.userId };
  },

  async listMine(userId: string, status: 'active' | 'past', limit: number, cursor?: string) {
    const statuses: BookingStatus[] = status === 'active' ? SEAT_HOLDING_STATUSES : ['COMPLETED', 'CANCELLED', 'REJECTED'];
    const rows = await prisma.booking.findMany({
      where: {
        passengerId: userId,
        status: { in: statuses },
      },
      include: passengerBookingInclude,
      // Tasdiqlanmaganlar tepada (MySQL ENUM tartibi: PENDING birinchi), keyin yangilari
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map(toPassengerBookingDto), nextCursor };
  },

  async confirm(userId: string, id: string) {
    const { booking, trip } = await driverBooking(userId, id);
    // Tasdiqlaganda yo'lovchi raqami ochiladi — tarif yoqilgan bo'lsa, obuna faol bo'lishi kerak
    await assertDriverSubscription(await getDriverProfile(userId));
    if (trip.status !== 'SCHEDULED' && trip.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION');
    await transaction((tx) => transitionBooking(tx, booking, 'CONFIRMED'));
    return { booking: await bookingsService.driverView(id), passengerId: booking.passengerId };
  },

  async reject(userId: string, id: string) {
    const { booking } = await driverBooking(userId, id);
    await transaction(async (tx) => {
      await transitionBooking(tx, booking, 'REJECTED');
      await tx.trip.update({ where: { id: booking.tripId }, data: { availableSeats: { increment: booking.seats } } });
    });
    return { booking: await bookingsService.driverView(id), passengerId: booking.passengerId };
  },

  /** Yo'lovchi bekor qiladi. Jo'nashga 2 soatdan kam qolgan bo'lsa — cancelledLate. */
  async cancel(userId: string, id: string) {
    const booking = await prisma.booking.findUnique({ where: { id }, include: { trip: { include: { driver: true } } } });
    if (!booking || booking.passengerId !== userId) throw new AppError('BOOKING_NOT_FOUND');
    if (booking.trip.status !== 'SCHEDULED') throw new AppError('INVALID_STATE_TRANSITION');

    const now = new Date();
    const late = booking.trip.departureAt.getTime() - now.getTime() < LATE_CANCEL_MS;
    await transaction(async (tx) => {
      await transitionBooking(tx, booking, 'CANCELLED', { cancelledAt: now, cancelledLate: late });
      await tx.trip.update({ where: { id: booking.tripId }, data: { availableSeats: { increment: booking.seats } } });
    });
    return { booking: await loadPassengerDto(id), driverUserId: booking.trip.driver.userId };
  },

  /** Haydovchi ko'rinishi: yo'lovchi kontakti faqat tasdiqlangandan keyin. */
  async driverView(id: string) {
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        passenger: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, phone: true, telegramUsername: true, ...clientRatingSelect } },
        reviews: { select: { authorId: true } },
      },
    });
    const open = CONTACT_BOOKING_STATUSES.has(b.status);
    const dto = baseDto(b);
    // Xaritadagi aniq nuqta (uy joylashuvi) — kontakt kabi faqat tasdiqlangandan keyin
    const coords = open ? {} : { pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null };
    return {
      ...dto,
      ...coords,
      passenger: toPublicUserDto(b.passenger),
      contact: open ? toContact(b.passenger) : null,
      // Haydovchi yo'lovchiga baho qo'yganmi (yo'lovchining o'zi yozgan sharh hisobga olinmaydi)
      reviewed: b.reviews.some((r) => r.authorId !== b.passengerId),
    };
  },

  async listForTrip(userId: string, tripId: string) {
    await ownTrip(userId, tripId);
    // Tasdiqlanmagan so'rovlar tepada
    const rows = await prisma.booking.findMany({ where: { tripId }, select: { id: true }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
    return Promise.all(rows.map((r) => bookingsService.driverView(r.id)));
  },

  /**
   * Haydovchining barcha faol safarlaridagi tasdiqlanmagan so'rovlari (eng uzoq kutayotgani birinchi) —
   * kabinet tepasida "kutilayotgan so'rovlar" sifatida ko'rsatiladi.
   */
  async pendingForDriver(userId: string) {
    const profile = await getDriverProfile(userId);
    const rows = await prisma.booking.findMany({
      where: { status: 'PENDING', trip: { driverId: profile.id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } },
      include: {
        passenger: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, ...clientRatingSelect } },
        trip: { include: { fromCity: { select: { id: true, nameUz: true, nameRu: true, region: true } }, toCity: { select: { id: true, nameUz: true, nameRu: true, region: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    return rows.map((b) => ({
      ...baseDto(b),
      // Aniq nuqta tasdiqlangandan keyin (driverView bilan bir xil qoida)
      pickupLat: null,
      pickupLng: null,
      dropoffLat: null,
      dropoffLng: null,
      contact: null,
      passenger: toPublicUserDto(b.passenger),
      trip: { id: b.trip.id, from: b.trip.fromCity, to: b.trip.toCity, departureAt: b.trip.departureAt },
    }));
  },

  /** Bitta band qilish: yo'lovchi o'z ko'rinishini, safar haydovchisi — haydovchi ko'rinishini oladi. */
  async getById(userId: string, id: string) {
    const b = await prisma.booking.findUnique({ where: { id }, include: { trip: { include: { driver: true } } } });
    if (!b) throw new AppError('BOOKING_NOT_FOUND');
    if (b.passengerId === userId) return loadPassengerDto(id);
    if (b.trip.driver.userId === userId) return bookingsService.driverView(id);
    throw new AppError('BOOKING_NOT_FOUND');
  },

  /** Safarda o'rin egallab turgan yo'lovchilar (safar o'zgarganda xabar berish uchun). */
  async holdingPassengers(tripId: string) {
    return prisma.booking.findMany({
      where: { tripId, status: { in: SEAT_HOLDING_STATUSES } },
      select: { id: true, passengerId: true },
    });
  },

  /** Safar tafsilotida joriy foydalanuvchining band qilishi (kontakt qoidasi bilan). */
  async viewerBooking(userId: string, tripId: string) {
    const b = await prisma.booking.findFirst({
      where: { tripId, passengerId: userId },
      orderBy: { createdAt: 'desc' },
      include: passengerBookingInclude,
    });
    if (!b) return null;
    const { trip: _trip, ...dto } = toPassengerBookingDto(b);
    return { ...dto, fullPlateNumber: CONTACT_BOOKING_STATUSES.has(b.status) ? b.trip.vehicle.plateNumber : null };
  },
};
