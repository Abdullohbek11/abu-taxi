import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser } from '../../test/helpers.js';

const app = createApp();
const DAY = 24 * 3600_000;

async function completedBooking(opts: { completedAgoMs?: number; status?: 'COMPLETED' | 'CONFIRMED' } = {}) {
  const c = await createCities();
  const driver = await createApprovedDriver();
  const passenger = await createUser({ firstName: 'Kamola', lastName: 'Ismoilova' });
  const trip = await createTrip(driver, {
    fromCityId: c.andijon.id,
    toCityId: c.toshkent.id,
    status: opts.status === 'CONFIRMED' ? 'SCHEDULED' : 'COMPLETED',
    completedAt: new Date(Date.now() - (opts.completedAgoMs ?? DAY)),
  });
  const booking = await prisma.booking.create({
    data: { tripId: trip.id, passengerId: passenger.user.id, seats: 1, totalPrice: 150_000, status: opts.status ?? 'COMPLETED' },
  });
  return { driver, passenger, trip, booking };
}

const review = (token: string, body: object) => request(app).post('/api/v1/reviews').set(bearer(token)).send(body);

describe('sharhlar va reyting', () => {
  beforeEach(resetDb);

  it("yo'lovchi haydovchiga sharh yozadi; reyting qayta hisoblanadi", async () => {
    const { driver, passenger, booking } = await completedBooking();
    const res = await review(passenger.token, { bookingId: booking.id, rating: 4, text: "Yaxshi haydovchi" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ rating: 4, targetUserId: driver.user.id, author: { name: 'Kamola I.' } });

    const p2 = await createUser();
    const b2 = await prisma.booking.create({
      data: { tripId: booking.tripId, passengerId: p2.user.id, seats: 1, totalPrice: 150_000, status: 'COMPLETED' },
    });
    await review(p2.token, { bookingId: b2.id, rating: 5 }).expect(201);

    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { id: driver.profile.id } });
    expect(Number(profile.ratingAvg)).toBe(4.5);
    expect(profile.ratingCount).toBe(2);

    const list = await request(app).get(`/api/v1/users/${driver.user.id}/reviews?limit=1`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.nextCursor).toBeTypeOf('string');
  });

  it("haydovchi ham yo'lovchiga sharh yoza oladi", async () => {
    const { driver, passenger, booking } = await completedBooking();
    const res = await review(driver.token, { bookingId: booking.id, rating: 5 });
    expect(res.body.data.targetUserId).toBe(passenger.user.id);
  });

  it("bitta muallif — bitta sharh; begona — 403; yakunlanmagan — 403; 14 kundan keyin — 409", async () => {
    const a = await completedBooking();
    await review(a.passenger.token, { bookingId: a.booking.id, rating: 5 }).expect(201);
    expect((await review(a.passenger.token, { bookingId: a.booking.id, rating: 3 })).body.error.code).toBe('REVIEW_ALREADY_EXISTS');
    const stranger = await createUser();
    expect((await review(stranger.token, { bookingId: a.booking.id, rating: 3 })).body.error.code).toBe('REVIEW_NOT_ALLOWED');

    await resetDb();
    const b = await completedBooking({ status: 'CONFIRMED' });
    expect((await review(b.passenger.token, { bookingId: b.booking.id, rating: 5 })).body.error.code).toBe('REVIEW_NOT_ALLOWED');

    await resetDb();
    const old = await completedBooking({ completedAgoMs: 15 * DAY });
    expect((await review(old.passenger.token, { bookingId: old.booking.id, rating: 5 })).body.error.code).toBe('REVIEW_WINDOW_CLOSED');
  });

  it("validatsiya: reyting 1–5, bookingId yoki cargoRequestId dan faqat bittasi", async () => {
    const { passenger, booking } = await completedBooking();
    expect((await review(passenger.token, { bookingId: booking.id, rating: 6 })).status).toBe(400);
    expect((await review(passenger.token, { rating: 5 })).status).toBe(400);
    expect((await review(passenger.token, { bookingId: booking.id, cargoRequestId: 'x', rating: 5 })).status).toBe(400);
  });

  it('yetkazilgan yuk uchun sharh', async () => {
    const c = await createCities();
    const sender = await createUser({ role: 'SENDER' });
    const driver = await createApprovedDriver({ acceptsCargo: true });
    const cargo = await prisma.cargoRequest.create({
      data: {
        senderId: sender.user.id,
        type: 'OTHER',
        weightKg: 5,
        fromCityId: c.andijon.id,
        toCityId: c.toshkent.id,
        pickupAddress: 'Andijon',
        dropoffAddress: 'Toshkent',
        date: new Date(),
        status: 'DELIVERED',
        deliveredAt: new Date(),
        offers: { create: { driverId: driver.profile.id, price: 50_000, status: 'ACCEPTED' } },
      },
    });
    const res = await review(sender.token, { cargoRequestId: cargo.id, rating: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data.targetUserId).toBe(driver.user.id);
  });
});

describe("reyting: haydovchi va mijoz alohida, so'rov orqali safarlar, Bayes bahosi", () => {
  beforeEach(resetDb);

  it("haydovchi yo'lovchi bo'lib olgan baholari haydovchi reytingiga qo'shilmaydi; mijoz reytingi alohida", async () => {
    const { driver, passenger, booking } = await completedBooking();
    await review(passenger.token, { bookingId: booking.id, rating: 5 }).expect(201);
    await review(driver.token, { bookingId: booking.id, rating: 2 }).expect(201);

    // Haydovchining o'zi boshqa safarda yo'lovchi bo'lgan va yomon baho olgan
    const other = await createApprovedDriver({ firstName: 'Rustam' });
    const c = await prisma.city.findFirstOrThrow();
    const c2 = await prisma.city.findFirstOrThrow({ where: { id: { not: c.id } } });
    const trip2 = await createTrip(other, { fromCityId: c.id, toCityId: c2.id, status: 'COMPLETED', completedAt: new Date() });
    const asPassenger = await prisma.booking.create({ data: { tripId: trip2.id, passengerId: driver.user.id, seats: 1, totalPrice: 100_000, status: 'COMPLETED' } });
    await review(other.token, { bookingId: asPassenger.id, rating: 1 }).expect(201);

    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { id: driver.profile.id } });
    expect(Number(profile.ratingAvg)).toBe(5);
    expect(profile.ratingCount).toBe(1);
    const p = await prisma.user.findUniqueOrThrow({ where: { id: passenger.user.id } });
    expect([Number(p.clientRatingAvg), p.clientRatingCount]).toEqual([2, 1]);

    const pub = await request(app).get(`/api/v1/users/${driver.user.id}/public`);
    expect(pub.body.data.driverRating).toMatchObject({ avg: 5, count: 1 });
    expect(pub.body.data.clientRating).toMatchObject({ avg: 1, count: 1 });
    expect(pub.body.data.driverRating.distribution.at(0)).toEqual({ stars: 5, count: 1 });
    const onlyDriver = await request(app).get(`/api/v1/users/${driver.user.id}/reviews?role=DRIVER`);
    expect(onlyDriver.body.data.map((r: { rating: number }) => r.rating)).toEqual([5]);
  });

  it("haydovchi kutayotgan so'rovda yo'lovchining reytingi ko'rinadi", async () => {
    const { driver, passenger, booking } = await completedBooking();
    await review(driver.token, { bookingId: booking.id, rating: 4 }).expect(201);
    const c = await prisma.city.findFirstOrThrow();
    const c2 = await prisma.city.findFirstOrThrow({ where: { id: { not: c.id } } });
    const trip = await createTrip(driver, { fromCityId: c.id, toCityId: c2.id });
    await prisma.booking.create({ data: { tripId: trip.id, passengerId: passenger.user.id, seats: 1, totalPrice: 150_000, status: 'PENDING' } });
    const res = await request(app).get(`/api/v1/trips/${trip.id}/bookings`).set(bearer(driver.token));
    expect(res.status).toBe(200);
    expect(res.body.data[0].passenger.clientRating).toEqual({ avg: 4, count: 1 });
  });

  it("so'rov orqali kelishilgan safar: kuni kelgach ikkala tomon baholaydi, oldin — 403", async () => {
    const c = await createCities();
    const driver = await createApprovedDriver();
    const passenger = await createUser();
    const base = { passengerId: passenger.user.id, fromCityId: c.andijon.id, toCityId: c.toshkent.id, seats: 1, status: 'ASSIGNED' as const, driverId: driver.profile.id, pricePerSeat: 150_000 };
    const future = await prisma.rideRequest.create({ data: { ...base, date: new Date(Date.now() + 3 * DAY) } });
    const past = await prisma.rideRequest.create({ data: { ...base, date: new Date(Date.now() - DAY) } });

    expect((await review(passenger.token, { rideRequestId: future.id, rating: 5 })).status).toBe(403);
    const mine = await request(app).get('/api/v1/ride-requests/my').set(bearer(passenger.token));
    const flags = Object.fromEntries(mine.body.data.map((r: { id: string; canReview: boolean }) => [r.id, r.canReview]));
    expect(flags).toEqual({ [future.id]: false, [past.id]: true });

    await review(passenger.token, { rideRequestId: past.id, rating: 4 }).expect(201);
    await review(driver.token, { rideRequestId: past.id, rating: 5 }).expect(201);
    expect((await review(passenger.token, { rideRequestId: past.id, rating: 5 })).body.error.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(Number((await prisma.driverProfile.findUniqueOrThrow({ where: { id: driver.profile.id } })).ratingAvg)).toBe(4);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: passenger.user.id } })).clientRatingCount).toBe(1);

    // Admin qo'lda biriktirgan (tizimda yo'q) haydovchi — baholanmaydi
    const manual = await prisma.rideRequest.create({ data: { ...base, driverId: null, date: new Date(Date.now() - DAY) } });
    expect((await review(passenger.token, { rideRequestId: manual.id, rating: 5 })).status).toBe(403);
  });

  it("Bayes bahosi: bitta 5 lik yangi haydovchi 20 ta 4.8 lik tajribalidan oldinga o'tmaydi", async () => {
    const { ratingScore } = await import('./reviews.service.js');
    expect(ratingScore(5, 1)).toBeLessThan(ratingScore(4.8, 20));
    expect(ratingScore(0, 0)).toBeCloseTo(4.3);
  });
});
