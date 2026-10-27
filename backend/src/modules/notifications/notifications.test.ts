import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { signAccessToken } from '../../lib/jwt.js';
import { prisma } from '../../lib/prisma.js';
import { setIo } from '../../lib/realtime.js';
import { initSockets } from '../../sockets/index.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser, createUsers } from '../../test/helpers.js';

const app = createApp();

describe('bildirishnomalar (REST)', () => {
  beforeEach(resetDb);

  it("band qilish → haydovchiga booking:new; tasdiq → yo'lovchiga booking:updated", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });

    const b = await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 2 });
    await request(app).post(`/api/v1/bookings/${b.body.data.id}/confirm`).set(bearer(d.token)).expect(200);

    const dn = await request(app).get('/api/v1/notifications').set(bearer(d.token));
    expect(dn.body.data).toHaveLength(1);
    expect(dn.body.data[0]).toMatchObject({ type: 'booking:new', payload: { seats: 2, tripId: trip.id }, readAt: null });
    expect(dn.body.meta.unreadCount).toBe(1);

    const pn = await request(app).get('/api/v1/notifications').set(bearer(p.token));
    expect(pn.body.data[0]).toMatchObject({ type: 'booking:updated', payload: { status: 'CONFIRMED' } });

    // O'qilgan deb belgilash
    const read = await request(app).post(`/api/v1/notifications/${dn.body.data[0].id}/read`).set(bearer(d.token));
    expect(read.body.data.readAt).not.toBeNull();
    expect((await request(app).get('/api/v1/notifications?unread=true').set(bearer(d.token))).body.data).toHaveLength(0);

    // Boshqa foydalanuvchining bildirishnomasi — 404
    expect((await request(app).post(`/api/v1/notifications/${dn.body.data[0].id}/read`).set(bearer(p.token))).status).toBe(404);

    const all = await request(app).post('/api/v1/notifications/read-all').set(bearer(p.token));
    expect(all.body.data.updated).toBe(1);
  });

  it("safar bekor qilinsa har bir yo'lovchiga trip:updated", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const [p1, p2] = (await createUsers(2)) as [Awaited<ReturnType<typeof createUser>>, Awaited<ReturnType<typeof createUser>>];
    for (const p of [p1, p2]) await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 1 });

    await request(app).post(`/api/v1/trips/${trip.id}/cancel`).set(bearer(d.token)).expect(200);
    const n = await prisma.notification.findMany({ where: { type: 'trip:updated' } });
    expect(n.map((x) => x.userId).sort()).toEqual([p1.user.id, p2.user.id].sort());
  });

  it('admin tasdiqlasa haydovchiga driver:status', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const d = await createApprovedDriver();
    await prisma.document.createMany({
      data: [
        { driverId: d.profile.id, type: 'LICENSE', fileKey: 'k1' },
        { driverId: d.profile.id, type: 'TECH_PASSPORT', fileKey: 'k2' },
      ],
    });
    await request(app).post(`/api/v1/admin/drivers/${d.profile.id}/approve`).set(bearer(admin.token)).expect(200);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: d.user.id } });
    expect(n).toMatchObject({ type: 'driver:status', payload: { status: 'APPROVED' } });
  });
});

describe('Socket.IO', () => {
  let http: HttpServer;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    http = createServer(app);
    initSockets(http);
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

  afterAll(async () => {
    setIo(null);
    await new Promise((r) => http.close(r));
  });

  beforeEach(resetDb);

  function connect(token?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  it("tokensiz ulanish rad etiladi", async () => {
    await expect(connect()).rejects.toThrow('UNAUTHORIZED');
    await expect(connect('bad.token')).rejects.toThrow('TOKEN_INVALID');
  });

  it("haydovchi o'z xonasida booking:new va notification:new oladi, boshqalar olmaydi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();
    const other = await createUser();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });

    const driverSocket = await connect(signAccessToken({ sub: d.user.id, role: 'DRIVER' }));
    const otherSocket = await connect(signAccessToken({ sub: other.user.id, role: 'PASSENGER' }));
    const leaked: unknown[] = [];
    otherSocket.onAny((e, data) => leaked.push([e, data]));

    const bookingEvent = new Promise((r) => driverSocket.once('booking:new', r));
    const notifEvent = new Promise((r) => driverSocket.once('notification:new', r));

    await request(app).post('/api/v1/bookings').set(bearer(p.token)).send({ tripId: trip.id, seats: 1 }).expect(201);

    expect(await bookingEvent).toMatchObject({ tripId: trip.id, seats: 1, status: 'PENDING' });
    expect(await notifEvent).toMatchObject({ type: 'booking:new', userId: d.user.id });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toHaveLength(0);
  });
});
