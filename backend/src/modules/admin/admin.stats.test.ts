import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { tashkentToUtc } from '../../lib/time.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser } from '../../test/helpers.js';

const app = createApp();
const H = 3600_000;

describe('statistika', () => {
  beforeEach(resetDb);

  it("haydovchi: bugungi safarlar va haftalik daromad kunlar kesimida", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();

    // Bugun (Toshkent) yakunlangan safar: 2 yo'lovchi × 150 000.
    // Vaqt Toshkent kuni boshidan olinadi — yarim tun atrofida ham test barqaror bo'lishi uchun
    const todayTashkent = new Date(Date.now() + 5 * H).toISOString().slice(0, 10);
    const done = await createTrip(d, {
      fromCityId: c.andijon.id,
      toCityId: c.toshkent.id,
      departureAt: new Date(tashkentToUtc(todayTashkent).getTime() + 30_000),
      status: 'COMPLETED',
    });
    await prisma.booking.create({ data: { tripId: done.id, passengerId: p.user.id, seats: 2, totalPrice: 300_000, status: 'COMPLETED' } });
    // Bekor qilingan band qilish daromadga kirmaydi
    const p2 = await createUser();
    await prisma.booking.create({ data: { tripId: done.id, passengerId: p2.user.id, seats: 1, totalPrice: 150_000, status: 'CANCELLED' } });

    const res = await request(app).get('/api/v1/drivers/me/stats').set(bearer(d.token));
    expect(res.status).toBe(200);
    const { weeklyEarnings, weeklyTotal, today, trips } = res.body.data;
    expect(weeklyEarnings).toHaveLength(7);
    expect(weeklyEarnings[6]).toMatchObject({ date: today.date, passengers: 300_000, cargo: 0, total: 300_000 });
    expect(weeklyTotal).toBe(300_000);
    expect(trips.completed).toBe(1);

    expect((await request(app).get('/api/v1/drivers/me/stats').set(bearer(p.token))).status).toBe(403);
  });

  it('admin statistikasi', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const c = await createCities();
    const d = await createApprovedDriver();
    await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() + H) });
    await createUser({ role: null });

    const res = await request(app).get('/api/v1/admin/stats').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      users: { byRole: { ADMIN: 1, DRIVER: 1, NONE: 1 }, blocked: 0, newLast7Days: 3 },
      drivers: { APPROVED: 1 },
      trips: { SCHEDULED: 1 },
      volume30d: { passengers: 0, cargo: 0 },
    });
    expect((await request(app).get('/api/v1/admin/stats').set(bearer(d.token))).status).toBe(403);
  });
});
