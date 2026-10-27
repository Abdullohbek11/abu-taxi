import { prisma, transaction } from '../lib/prisma.js';
import { DAY_MS, HOUR_MS } from '../lib/time.js';
import { PENDING_BOOKING_TTL_MS } from '../modules/bookings/bookings.service.js';
import { SEAT_HOLDING_STATUSES } from '../modules/bookings/bookings.state.js';
import { notify, notifyMany } from '../modules/notifications/notifications.service.js';
import { expireRideRequests } from '../modules/ride-requests/rideRequests.service.js';
import { completeTrip } from '../modules/trips/trips.service.js';

/** Jo'nashdan shuncha vaqt o'tgan IN_PROGRESS safar avtomatik yakunlanadi. */
export const AUTO_COMPLETE_AFTER_MS = 12 * HOUR_MS;
/** Haydovchi biroz kechikib boshlashi mumkin — shundan keyin SCHEDULED safar bekor qilinadi. */
export const STALE_SCHEDULED_GRACE_MS = 3 * HOUR_MS;
export const CARGO_EXPIRE_AFTER_MS = 30 * DAY_MS;

/**
 * Har bir vazifa yozuvlarni bittalab atomik holat o'tishi bilan qayta ishlaydi:
 * agar yozuv parallel ravishda o'zgargan bo'lsa (masalan, haydovchi o'zi yakunlagan), o'tkazib yuboriladi.
 */
export async function autoCompleteTrips(now = new Date()): Promise<number> {
  const trips = await prisma.trip.findMany({
    where: { status: 'IN_PROGRESS', departureAt: { lt: new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS) } },
    select: { id: true, status: true, driverId: true },
    take: 500,
  });
  let done = 0;
  for (const trip of trips) {
    const passengers = await prisma.booking.findMany({ where: { tripId: trip.id, status: 'CONFIRMED' }, select: { id: true, passengerId: true } });
    try {
      await completeTrip(trip, trip.driverId);
    } catch {
      continue;
    }
    done++;
    await Promise.all(passengers.map((b) => notify(b.passengerId, 'trip:updated', { tripId: trip.id, bookingId: b.id, status: 'COMPLETED' })));
  }
  return done;
}

export async function cancelStaleScheduledTrips(now = new Date()): Promise<number> {
  const trips = await prisma.trip.findMany({
    where: { status: 'SCHEDULED', departureAt: { lt: new Date(now.getTime() - STALE_SCHEDULED_GRACE_MS) } },
    select: { id: true, driver: { select: { userId: true } } },
    take: 500,
  });
  let done = 0;
  for (const trip of trips) {
    const bookings = await prisma.booking.findMany({
      where: { tripId: trip.id, status: { in: SEAT_HOLDING_STATUSES } },
      select: { id: true, passengerId: true },
    });
    const ok = await transaction(async (tx) => {
      const res = await tx.trip.updateMany({ where: { id: trip.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
      if (res.count === 0) return false;
      await tx.booking.updateMany({
        where: { tripId: trip.id, status: { in: SEAT_HOLDING_STATUSES } },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      return true;
    });
    if (!ok) continue;
    done++;
    await notify(trip.driver.userId, 'trip:updated', { tripId: trip.id, status: 'CANCELLED', reason: 'EXPIRED' });
    await Promise.all(
      bookings.map((b) => notify(b.passengerId, 'trip:updated', { tripId: trip.id, bookingId: b.id, status: 'CANCELLED', reason: 'EXPIRED' })),
    );
  }
  return done;
}

export async function expireOldCargo(now = new Date()): Promise<number> {
  const cargo = await prisma.cargoRequest.findMany({
    where: { status: 'OPEN', createdAt: { lt: new Date(now.getTime() - CARGO_EXPIRE_AFTER_MS) } },
    select: { id: true, senderId: true },
    take: 1000,
  });
  let done = 0;
  for (const c of cargo) {
    const offers = await prisma.cargoOffer.findMany({
      where: { cargoRequestId: c.id, status: 'PENDING' },
      select: { driver: { select: { userId: true } } },
    });
    const ok = await transaction(async (tx) => {
      const res = await tx.cargoRequest.updateMany({ where: { id: c.id, status: 'OPEN' }, data: { status: 'CANCELLED' } });
      if (res.count === 0) return false;
      await tx.cargoOffer.updateMany({ where: { cargoRequestId: c.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      return true;
    });
    if (!ok) continue;
    done++;
    await notify(c.senderId, 'cargo:updated', { cargoId: c.id, status: 'CANCELLED', reason: 'EXPIRED' });
    await notifyMany(offers.map((o) => o.driver.userId), 'cargo:updated', { cargoId: c.id, status: 'CANCELLED', reason: 'EXPIRED' });
  }
  return done;
}

/**
 * Haydovchi javob bermagan band qilishlar o'rinlarni abadiy egallab turmasligi kerak:
 * PENDING_BOOKING_TTL_MS dan eski yoki jo'nash vaqti o'tgan PENDING → REJECTED, o'rin qaytariladi.
 */
export async function expirePendingBookings(now = new Date()): Promise<number> {
  const bookings = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      OR: [{ createdAt: { lt: new Date(now.getTime() - PENDING_BOOKING_TTL_MS) } }, { trip: { departureAt: { lt: now } } }],
    },
    select: { id: true, tripId: true, seats: true, passengerId: true, trip: { select: { driver: { select: { userId: true } } } } },
    take: 1000,
  });
  let done = 0;
  for (const b of bookings) {
    const ok = await transaction(async (tx) => {
      const res = await tx.booking.updateMany({ where: { id: b.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      if (res.count === 0) return false;
      await tx.trip.update({ where: { id: b.tripId }, data: { availableSeats: { increment: b.seats } } });
      return true;
    });
    if (!ok) continue;
    done++;
    const payload = { bookingId: b.id, tripId: b.tripId, status: 'REJECTED', reason: 'EXPIRED' };
    await notify(b.passengerId, 'booking:updated', payload);
    await notify(b.trip.driver.userId, 'booking:updated', payload);
  }
  return done;
}

export async function purgeExpiredRefreshTokens(now = new Date()): Promise<number> {
  const res = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return res.count;
}

/** Sanasi o'tgan ochiq safar so'rovlari EXPIRED bo'ladi, yo'lovchiga xabar boradi. */
export async function expireRideRequestsJob(now = new Date()): Promise<number> {
  const expired = await expireRideRequests(now.getTime());
  await Promise.all(expired.map((r) => notify(r.passengerId, 'ride:request:updated', { requestId: r.id, status: 'EXPIRED' })));
  return expired.length;
}
