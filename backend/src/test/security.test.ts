/**
 * Xavfsizlik regressiya testlari: har bir test aniq hujum ssenariysini sinaydi.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createApp } from '../app.js';
import { expirePendingBookings } from '../jobs/tasks.js';
import { signAccessToken, signRefreshToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { clientKey } from '../lib/rateLimit.js';
import { setIo } from '../lib/realtime.js';
import { errorHandler } from '../middlewares/errorHandler.js';
import { rateLimit, rateLimitMemoryHit } from '../middlewares/rateLimit.js';
import { initSockets } from '../sockets/index.js';
import { resetDb } from './db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser, loginViaBot, mockStorage } from './helpers.js';

const app = createApp();
const PHONE = '+998901112233';
const H = 3600_000;


afterEach(() => vi.restoreAllMocks());

describe('Rate limit', () => {
  beforeEach(resetDb);

  it.each(['memory', 'db'] as const)('rate limit (%s): limitdan oshganda 429 + Retry-After', async (store) => {
    // Kichik limitli alohida ilova — global limitni 300 ta so'rov bilan sinash sekin va beqaror edi
    const mini = express();
    mini.get('/x', rateLimit({ name: `t-${store}`, limit: 2, windowSec: 30, store }), (_req, res) => res.json({ ok: true }));
    mini.use(errorHandler);
    await request(mini).get('/x').expect(200);
    await request(mini).get('/x').expect(200);
    const res = await request(mini).get('/x');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    const retry = Number(res.headers['retry-after']);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(30);
  });

  it("global limit API'ga ulangan (xotiradagi hisoblagich)", async () => {
    const { user } = await createUser();
    // Hisoblagichni limit chegarasiga olib boramiz — 300 ta so'rov yubormasdan
    for (let i = 0; i < 300; i++) rateLimitMemoryHit(`global:${clientKey('::ffff:127.0.0.1')}`);
    const res = await request(app).get(`/api/v1/users/${user.id}/public`);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('Tokenlar', () => {
  beforeEach(resetDb);

  it("access token refresh o'rnida (va aksincha) ishlamaydi", async () => {
    const { user } = await createUser();
    const access = signAccessToken({ sub: user.id, role: 'PASSENGER' });
    const { token: refresh } = signRefreshToken(user.id);

    const r1 = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'mobile').send({ refreshToken: access });
    expect(r1.body.error.code).toBe('TOKEN_INVALID');
    const r2 = await request(app).get('/api/v1/users/me').set(bearer(refresh));
    expect(r2.body.error.code).toBe('TOKEN_INVALID');
  });

  it('"alg: none" va boshqa kalit bilan imzolangan tokenlar rad etiladi', async () => {
    const { user } = await createUser({ role: 'ADMIN' });
    const none = jwt.sign({ sub: user.id, role: 'ADMIN' }, '', { algorithm: 'none', issuer: 'abutax', audience: 'abutax:access' });
    const forged = jwt.sign({ sub: user.id, role: 'ADMIN' }, 'x'.repeat(40), { issuer: 'abutax', audience: 'abutax:access' });
    for (const t of [none, forged]) {
      const res = await request(app).get('/api/v1/admin/stats').set(bearer(t));
      expect(res.status).toBe(401);
    }
  });

  it("brauzer (Origin bor) X-Client: mobile yuborsa ham refresh token body'da qaytmaydi", async () => {
    const login = await loginViaBot(app, '900', PHONE, { headers: { Origin: 'http://localhost:5173', 'X-Client': 'mobile' } });
    expect(login.res.body.data.refreshToken).toBeUndefined();
    expect(login.cookie).toBeDefined();

    // XSS ssenariysi: cookie bilan refresh + X-Client: mobile → token baribir body'ga chiqmaydi
    const r = await request(app).post('/api/v1/auth/refresh').set('Cookie', login.cookie).set('X-Client', 'mobile');
    expect(r.status).toBe(200);
    expect(r.body.data.refreshToken).toBeUndefined();
  });
});

describe("Identifikatsiya faqat Telegram orqali", () => {
  beforeEach(resetDb);

  it("telefon va Telegram username'ni profil orqali o'zgartirib bo'lmaydi (kontaktni soxtalashtirish)", async () => {
    const { token } = await createUser();
    for (const body of [{ phone: '+998901111111' }, { telegramUsername: 'durov' }, { telegramId: '1' }]) {
      expect((await request(app).patch('/api/v1/users/me').set(bearer(token)).send(body)).status).toBe(400);
    }
  });

  it("eski SMS va Telegram Login Widget yo'llari olib tashlangan", async () => {
    for (const path of ['/auth/otp/send', '/auth/otp/verify', '/auth/telegram', '/users/me/phone', '/users/me/telegram']) {
      expect((await request(app).post(`/api/v1${path}`).send({})).status).toBe(404);
    }
  });

  it("ichki bot API'si orqali begona raqamga kod olib bo'lmaydi (maxfiy kalitsiz)", async () => {
    const res = await request(app)
      .post('/api/v1/internal/bot/login-code')
      .set('X-Bot-Secret', process.env.BOT_API_SECRET!.slice(0, -1) + 'X')
      .send({ telegramId: '1', phone: PHONE });
    expect(res.status).toBe(401);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("O'rinlarni egallab qo'yish hujumi (seat hoarding)", () => {
  beforeEach(resetDb);

  async function trips(n: number) {
    const c = await createCities();
    const d = await createApprovedDriver();
    const list = [];
    for (let i = 0; i < n; i++) list.push(await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id }));
    return list;
  }

  it("10 ta safarga parallel band qilish — ko'pi bilan 3 ta PENDING", async () => {
    const list = await trips(10);
    const attacker = await createUser();
    const results = await Promise.all(
      list.map((t) => request(app).post('/api/v1/bookings').set(bearer(attacker.token)).send({ tripId: t.id, seats: 4 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.body.error?.code === 'TOO_MANY_ACTIVE_BOOKINGS')).toHaveLength(7);
    expect(await prisma.booking.count({ where: { passengerId: attacker.user.id } })).toBe(3);
  });

  it("muddati o'tgan PENDING band qilish bekor qilinadi va o'rin qaytadi", async () => {
    const [trip] = await trips(1);
    const p = await createUser();
    const b = await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip!.id, seats: 3 });
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip!.id } })).availableSeats).toBe(1);

    await prisma.booking.update({ where: { id: b.body.data.id }, data: { createdAt: new Date(Date.now() - 4 * H) } });
    expect(await expirePendingBookings()).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.body.data.id } })).status).toBe('REJECTED');
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip!.id } })).availableSeats).toBe(4);
  });

  it("mass assignment: narx yoki holatni client o'zi belgilay olmaydi", async () => {
    const [trip] = await trips(1);
    const p = await createUser();
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(bearer(p.token))
      .send({ tripId: trip!.id, seats: 1, totalPrice: 1, status: 'CONFIRMED' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('_');
  });
});

describe('Bloklash oqibatlari', () => {
  beforeEach(resetDb);

  it("bloklangan haydovchining safarlari bekor bo'ladi, yo'lovchilar xabardor qilinadi", async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const p = await createUser();
    await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 1 }).expect(201);

    await request(app).post(`/api/v1/admin/users/${d.user.id}/block`).set(bearer(admin.token)).expect(200);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('CANCELLED');
    expect(await prisma.notification.count({ where: { userId: p.user.id, type: 'trip:updated' } })).toBe(1);

    const search = await request(app).get(`/api/v1/trips?from=${c.andijon.id}&to=${c.toshkent.id}`);
    expect(search.body.data).toHaveLength(0);
  });

  it("bloklangan yo'lovchining band qilishi bekor bo'ladi va o'rin qaytadi", async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const p = await createUser();
    await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 3 }).expect(201);

    await request(app).post(`/api/v1/admin/users/${p.user.id}/block`).set(bearer(admin.token)).expect(200);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).availableSeats).toBe(4);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.block' } });
    expect(audit).toMatchObject({ adminId: admin.user.id, targetId: p.user.id });
  });

  it('admin foydalanuvchini telefon/ism bo\'yicha topadi', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await createUser({ firstName: 'Shahnoza', phone: '+998977001122' });
    const byName = await request(app).get('/api/v1/admin/users?q=shahno').set(bearer(admin.token));
    expect(byName.body.data).toHaveLength(1);
    const byPhone = await request(app).get('/api/v1/admin/users?q=7700').set(bearer(admin.token));
    expect(byPhone.body.data[0].phone).toBe('+998977001122');
  });
});

describe("Ma'lumotlarga ruxsatsiz kirish (IDOR)", () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });

  it("begona band qilish — 404; yopilgan yukni taklif bermagan haydovchi ko'rmaydi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const p = await createUser();
    const b = await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 1 });

    const stranger = await createUser();
    expect((await request(app).get(`/api/v1/bookings/${b.body.data.id}`).set(bearer(stranger.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/bookings/${b.body.data.id}`).set(bearer(d.token))).body.data.passenger).toBeDefined();

    const sender = await createUser({ role: 'SENDER' });
    const cargo = await prisma.cargoRequest.create({
      data: {
        senderId: sender.user.id, type: 'OTHER', weightKg: 5, fromCityId: c.andijon.id, toCityId: c.toshkent.id,
        pickupAddress: 'Uy manzili', dropoffAddress: 'Ish manzili', date: new Date(), status: 'MATCHED',
      },
    });
    const outsider = await createApprovedDriver();
    expect((await request(app).get(`/api/v1/cargo/${cargo.id}`).set(bearer(outsider.token))).status).toBe(404);
  });
});

describe('Kiritish va fayllar', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });

  /** Kichik PNG, lekin sarlavhada 20000×20000 (400 MP) — "dekompressiya bombasi". */
  function pngBomb(): Buffer {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc = (buf: Buffer) => {
      let c = 0xffffffff;
      for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(td));
      return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20000, 0);
    ihdr.writeUInt32BE(20000, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  it('400 megapikselli rasm (kichik fayl) rad etiladi', async () => {
    const { token } = await createUser();
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(bearer(token))
      .attach('file', pngBomb(), { filename: 'bomb.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(['IMAGE_TOO_LARGE', 'FILE_TYPE_NOT_ALLOWED']).toContain(res.body.error.code);
  });

  it("izohdagi boshqaruv va bidi belgilari olib tashlanadi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const res = await request(app)
      .post('/api/v1/trips')
      .set(bearer(d.token))
      .send({
        vehicleId: d.vehicle.id,
        fromCityId: c.andijon.id,
        toCityId: c.toshkent.id,
        departureAt: new Date(Date.now() + 5 * H).toISOString(),
        pricePerSeat: 150_000,
        note: 'Salom‮txt.exe\u0000',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.note).toBe('Salomtxt.exe');
  });

  it('juda katta JSON body — rad etiladi', async () => {
    const { token } = await createUser();
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ firstName: 'a'.repeat(200_000) }));
    expect(res.status).toBe(413);
  });
});

describe('yordamchilar', () => {
  it("IPv6 manzillar /64 bo'yicha guruhlanadi, IPv4 o'zgarmaydi", () => {
    expect(clientKey('2001:db8:1:2:aaaa::1')).toBe(clientKey('2001:db8:1:2:ffff:1:2:3'));
    expect(clientKey('2001:db8:1:2::1')).not.toBe(clientKey('2001:db8:1:3::1'));
    expect(clientKey('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(clientKey(undefined)).toBe('unknown');
  });
});

describe('Socket.IO: token muddati', () => {
  let http: HttpServer;
  let url: string;

  beforeAll(async () => {
    await resetDb();
    http = createServer(app);
    initSockets(http);
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    setIo(null);
    await new Promise((r) => http.close(r));
  });

  it('token muddati tugaganda ulanish server tomonidan uziladi', async () => {
    const { user } = await createUser();
    const token = jwt.sign({ sub: user.id, role: 'PASSENGER' }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: 2,
      issuer: 'abutax',
      audience: 'abutax:access',
    });
    const socket = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((r) => socket.once('connect', () => r()));
    const reason = await new Promise<string>((r) => socket.once('disconnect', r));
    expect(reason).toBe('io server disconnect');
  });
});
