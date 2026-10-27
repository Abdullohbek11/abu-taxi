import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { resetDb } from './db.js';
import { bearer, createUser } from './helpers.js';

const app = createApp();
type M = 'get' | 'post' | 'patch' | 'put' | 'delete';

const AUTH_REQUIRED: [M, string][] = [
  ['get', '/users/me'], ['patch', '/users/me'], ['post', '/users/me/avatar'], ['patch', '/users/me/role'],
  ['get', '/bookings/x'], ['get', '/offers/my'],
  ['get', '/admin/users'], ['get', '/admin/audit'],
  ['post', '/auth/logout-all'],
  ['post', '/drivers/register'], ['get', '/drivers/me'], ['get', '/drivers/me/stats'], ['post', '/drivers/me/documents'],
  ['get', '/vehicles'], ['post', '/vehicles'], ['patch', '/vehicles/x'], ['delete', '/vehicles/x'],
  ['get', '/trips/my'], ['post', '/trips'], ['patch', '/trips/x'], ['post', '/trips/x/cancel'], ['post', '/trips/x/start'],
  ['post', '/trips/x/complete'], ['get', '/trips/x/bookings'],
  ['post', '/bookings'], ['get', '/bookings/my'], ['post', '/bookings/x/confirm'], ['post', '/bookings/x/reject'], ['post', '/bookings/x/cancel'],
  ['post', '/cargo'], ['get', '/cargo/my'], ['get', '/cargo/open'], ['get', '/cargo/x'], ['post', '/cargo/x/cancel'],
  ['post', '/cargo/x/status'], ['post', '/cargo/x/offers'], ['get', '/cargo/x/offers'],
  ['post', '/offers/x/accept'], ['post', '/offers/x/reject'], ['post', '/offers/x/withdraw'],
  ['post', '/reviews'], ['get', '/notifications'], ['post', '/notifications/x/read'], ['post', '/notifications/read-all'],
  ['get', '/admin/stats'], ['get', '/admin/drivers'], ['post', '/admin/drivers/x/approve'], ['post', '/admin/drivers/x/reject'],
  ['get', '/admin/documents/x'], ['post', '/admin/users/x/block'], ['post', '/admin/users/x/unblock'],
  // Safar so'rovlari
  ['post', '/ride-requests'], ['get', '/ride-requests/my'], ['get', '/ride-requests/open'], ['get', '/ride-requests/assigned'],
  ['post', '/ride-requests/x/take'], ['post', '/ride-requests/x/cancel'],
  // Admin: so'rovlar, ma'lumotlar bazasi, eksport, parol
  ['get', '/admin/ride-requests'], ['post', '/admin/ride-requests/x/assign'], ['post', '/admin/ride-requests/x/cancel'],
  ['get', '/admin/overview'], ['get', '/admin/users/x'], ['get', '/admin/trips'], ['get', '/admin/bookings'], ['get', '/admin/cargo'],
  ['get', '/admin/reviews'], ['delete', '/admin/reviews/x'], ['get', '/admin/export/users'], ['post', '/admin/me/password'],
  // Tarif va to'lovlar
  ['get', '/billing/plan'], ['post', '/billing/payments'], ['post', '/billing/payments/online'],
  ['get', '/admin/billing/settings'], ['put', '/admin/billing/settings'], ['get', '/admin/payments'], ['get', '/admin/payments/x/receipt'],
  ['post', '/admin/payments/x/confirm'], ['post', '/admin/payments/x/reject'], ['post', '/admin/users/x/subscription'],
];

const DRIVER_ONLY: [M, string][] = [
  ['get', '/drivers/me'], ['get', '/drivers/me/stats'], ['get', '/vehicles'], ['post', '/vehicles'],
  ['get', '/trips/my'], ['post', '/trips'], ['post', '/trips/x/cancel'], ['get', '/trips/x/bookings'],
  ['post', '/bookings/x/confirm'], ['post', '/bookings/x/reject'],
  ['get', '/cargo/open'], ['post', '/cargo/x/offers'], ['post', '/offers/x/withdraw'], ['get', '/offers/my'],
  ['get', '/ride-requests/open'], ['get', '/ride-requests/assigned'], ['post', '/ride-requests/x/take'],
  ['get', '/billing/plan'], ['post', '/billing/payments'], ['post', '/billing/payments/online'],
];

const ADMIN_ONLY = AUTH_REQUIRED.filter(([, p]) => p.startsWith('/admin'));

const PUBLIC: [M, string][] = [['get', '/cities'], ['get', '/trips?from=x&to=y'], ['get', '/users/x/public'], ['get', '/users/x/reviews']];

describe('ruxsatlar matritsasi', () => {
  let passenger: string;
  let driver: string;

  beforeAll(async () => {
    await resetDb();
    passenger = (await createUser({ role: 'PASSENGER' })).token;
    driver = (await createUser({ role: 'DRIVER' })).token;
  });

  it.each(AUTH_REQUIRED)('%s %s — tokensiz 401', async (m, p) => {
    const res = await request(app)[m](`/api/v1${p}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each(DRIVER_ONLY)("%s %s — yo'lovchi uchun 403", async (m, p) => {
    const res = await request(app)[m](`/api/v1${p}`).set(bearer(passenger)).send({});
    expect(res.status).toBe(403);
  });

  it.each(ADMIN_ONLY)('%s %s — haydovchi uchun 403', async (m, p) => {
    const res = await request(app)[m](`/api/v1${p}`).set(bearer(driver)).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(PUBLIC)('%s %s — tokensiz ochiq (401 emas)', async (m, p) => {
    const res = await request(app)[m](`/api/v1${p}`);
    expect(res.status).not.toBe(401);
  });
});
