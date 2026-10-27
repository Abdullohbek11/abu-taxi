import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { resetDb } from '../test/db.js';
import { createApprovedDriver, createCities, createTrip, createUser } from '../test/helpers.js';
import { autoCompleteTrips, cancelStaleScheduledTrips, expireOldCargo, purgeExpiredRefreshTokens } from './tasks.js';

const H = 3600_000;
const DAY = 24 * H;

describe('cron vazifalari', () => {
  beforeEach(resetDb);

  it("jo'nashdan 12 soat o'tgan IN_PROGRESS safar COMPLETED bo'ladi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();
    const old = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, status: 'IN_PROGRESS', departureAt: new Date(Date.now() - 13 * H) });
    const recent = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, status: 'IN_PROGRESS', departureAt: new Date(Date.now() - 5 * H) });
    const b = await prisma.booking.create({ data: { tripId: old.id, passengerId: p.user.id, seats: 1, totalPrice: 150_000, status: 'CONFIRMED' } });

    expect(await autoCompleteTrips()).toBe(1);
    const t = await prisma.trip.findUniqueOrThrow({ where: { id: old.id } });
    expect(t.status).toBe('COMPLETED');
    expect(t.completedAt).not.toBeNull();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe('IN_PROGRESS');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('COMPLETED');
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: d.profile.id } })).tripsCount).toBe(1);
    expect(await prisma.notification.count({ where: { userId: p.user.id, type: 'trip:updated' } })).toBe(1);

    expect(await autoCompleteTrips()).toBe(0); // idempotent
  });

  it("o'tib ketgan SCHEDULED safar va uning band qilishlari CANCELLED", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();
    const stale = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() - 4 * H) });
    const soon = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() - H) });
    await prisma.booking.create({ data: { tripId: stale.id, passengerId: p.user.id, seats: 1, totalPrice: 150_000 } });

    expect(await cancelStaleScheduledTrips()).toBe(1);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('CANCELLED');
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: soon.id } })).status).toBe('SCHEDULED'); // 3 soatlik muhlat
    expect(await prisma.booking.count({ where: { status: 'CANCELLED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'trip:updated' } })).toBe(2); // haydovchi + yo'lovchi
  });

  it("30 kundan eski OPEN yuk CANCELLED, takliflari REJECTED", async () => {
    const c = await createCities();
    const s = await createUser({ role: 'SENDER' });
    const d = await createApprovedDriver();
    const base = { senderId: s.user.id, type: 'OTHER' as const, weightKg: 5, fromCityId: c.andijon.id, toCityId: c.toshkent.id, pickupAddress: 'A', dropoffAddress: 'B', date: new Date() };
    const old = await prisma.cargoRequest.create({
      data: { ...base, createdAt: new Date(Date.now() - 31 * DAY), offers: { create: { driverId: d.profile.id, price: 50_000 } } },
    });
    const fresh = await prisma.cargoRequest.create({ data: { ...base, createdAt: new Date(Date.now() - 10 * DAY) } });

    expect(await expireOldCargo()).toBe(1);
    expect((await prisma.cargoRequest.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('CANCELLED');
    expect((await prisma.cargoRequest.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('OPEN');
    expect(await prisma.cargoOffer.count({ where: { status: 'REJECTED' } })).toBe(1);
  });

  it("muddati o'tgan refresh tokenlar o'chiriladi", async () => {
    const u = await createUser();
    await prisma.refreshToken.createMany({
      data: [
        { userId: u.user.id, tokenHash: 'old', expiresAt: new Date(Date.now() - DAY) },
        { userId: u.user.id, tokenHash: 'live', expiresAt: new Date(Date.now() + DAY) },
      ],
    });
    expect(await purgeExpiredRefreshTokens()).toBe(1);
    expect((await prisma.refreshToken.findMany()).map((t) => t.tokenHash)).toEqual(['live']);
  });
});
