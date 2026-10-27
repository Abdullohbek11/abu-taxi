import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { createApprovedDriver, createCities, createTrip, createUser } from '../../test/helpers.js';
import { clearStatsCache } from './stats.routes.js';

const app = createApp();

describe("landing: haqiqiy ko'rsatkichlar va sharhlar", () => {
  beforeEach(async () => {
    await resetDb();
    clearStatsCache();
  });

  it("bo'sh platformada — 0 va reyting yo'q (soxta raqam ko'rsatilmaydi)", async () => {
    const res = await request(app).get('/api/v1/stats/public');
    expect(res.body.data).toEqual({ trips: 0, drivers: 0, rating: null });
    expect((await request(app).get('/api/v1/reviews/recent')).body.data).toEqual([]);
  });

  it("yakunlangan safarlar, tasdiqlangan haydovchilar va sharhlar hisoblanadi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser({ firstName: 'Dilnoza', lastName: 'Karimova' });
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, status: 'COMPLETED' });
    const b = await prisma.booking.create({ data: { tripId: trip.id, passengerId: p.user.id, seats: 1, totalPrice: 1, status: 'COMPLETED' } });
    await prisma.review.create({ data: { authorId: p.user.id, targetUserId: d.user.id, bookingId: b.id, rating: 5, text: 'Juda yaxshi haydovchi, vaqtida yetib keldik' } });
    const p2 = await createUser();
    const b2 = await prisma.booking.create({ data: { tripId: trip.id, passengerId: p2.user.id, seats: 1, totalPrice: 1, status: 'COMPLETED' } });
    await prisma.review.create({ data: { authorId: p2.user.id, targetUserId: d.user.id, bookingId: b2.id, rating: 3, text: 'Yomon emas, lekin kechikdi' } });

    expect((await request(app).get('/api/v1/stats/public')).body.data).toEqual({ trips: 1, drivers: 1, rating: 4 });
    const recent = (await request(app).get('/api/v1/reviews/recent')).body.data;
    expect(recent).toHaveLength(1); // 3 baholi ko'rsatilmaydi
    expect(recent[0]).toMatchObject({ rating: 5, author: { name: 'Dilnoza K.' }, route: { from: { nameUz: 'Andijon' }, to: { nameUz: 'Toshkent' } } });
    expect(JSON.stringify(recent)).not.toMatch(/\+998/);
  });
});
