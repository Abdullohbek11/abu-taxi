import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { expireRideRequestsJob } from '../../jobs/tasks.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, botHeaders, createApprovedDriver, createCities, createTrip, createUser } from '../../test/helpers.js';
import { rideRequestsService } from './rideRequests.service.js';

const app = createApp();
const tashkentDay = (offsetDays = 0) => new Date(Date.now() + 5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const c = await createCities();
  const passenger = await createUser({ firstName: 'Dilnoza', lastName: 'Karimova', telegramUsername: 'dilnoza', telegramId: '5001' });
  // d1 — shu yo'nalishda (Toshkent → Andijon) safar qilgan: xabar oladi
  const d1 = await createApprovedDriver({ firstName: 'Sardor' });
  await prisma.user.update({ where: { id: d1.user.id }, data: { telegramId: '7001', telegramUsername: 'sardor_taxi' } });
  await createTrip(d1, { fromCityId: c.toshkent.id, toCityId: c.andijon.id });
  // d2 — bu yo'nalishda safari yo'q: shaxsiy xabar olmaydi, lekin saytda yoki guruhda olishi mumkin
  const d2 = await createApprovedDriver({ firstName: 'Rustam' });
  await prisma.user.update({ where: { id: d2.user.id }, data: { telegramId: '7002' } });
  return { c, passenger, d1, d2 };
}

const createRequest = (token: string, body: object) => request(app).post('/api/v1/ride-requests').set(bearer(token)).send(body);
const take = (token: string, id: string, pricePerSeat = 150_000) =>
  request(app).post(`/api/v1/ride-requests/${id}/take`).set(bearer(token)).send({ pricePerSeat });

describe("safar so'rovlari", () => {
  beforeEach(() => resetDb());

  it("yaratish: faqat shu yo'nalishdagi haydovchilarga xabar boradi, telefon ko'rinmaydi", async () => {
    const { c, passenger, d1, d2 } = await setup();
    const res = await createRequest(passenger.token, {
      fromCityId: c.asaka.id,
      toCityId: c.toshkent.id,
      date: tashkentDay(1),
      seats: 2,
      offeredPrice: 150_000,
      note: 'Ertalab 7 da',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
    expect(res.body.data.assignment).toBeNull();

    const n1 = await prisma.notification.findMany({ where: { userId: d1.user.id, type: 'ride:request:new' } });
    expect(n1).toHaveLength(1);
    expect(n1[0]!.payload).toMatchObject({ requestId: res.body.data.id, seats: 2, offeredPrice: 150_000, from: { uz: 'Asaka' } });
    expect(JSON.stringify(n1[0]!.payload)).not.toContain(passenger.user.phone!);
    expect(await prisma.notification.count({ where: { userId: d2.user.id } })).toBe(0);

    // Haydovchilar ro'yxatida telefon yo'q
    const open = await request(app).get('/api/v1/ride-requests/open').set(bearer(d2.token));
    expect(open.status).toBe(200);
    expect(open.body.data).toHaveLength(1);
    expect(JSON.stringify(open.body.data)).not.toContain(passenger.user.phone!);
    expect(open.body.data[0].passenger.name).toBe('Dilnoza K.');
  });

  it("haydovchi olganda yo'lovchiga haydovchi, mashina, narx va telefon boradi; ikkinchisi 409", async () => {
    const { c, passenger, d1, d2 } = await setup();
    const { body } = await createRequest(passenger.token, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(), seats: 1 });
    const id = body.data.id;

    const [a, b] = await Promise.all([take(d1.token, id, 140_000), take(d2.token, id, 130_000)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? d1 : d2;
    const won = a.status === 200 ? a : b;
    expect(won.body.data.passengerContact).toMatchObject({ phone: passenger.user.phone, name: 'Dilnoza Karimova' });

    const mine = await request(app).get('/api/v1/ride-requests/my').set(bearer(passenger.token));
    const r = mine.body.data[0];
    expect(r.status).toBe('ASSIGNED');
    expect(r.assignment).toMatchObject({
      phone: winner.user.phone,
      carModel: 'Chevrolet Cobalt',
      carPlate: winner.vehicle.plateNumber,
      pricePerSeat: a.status === 200 ? 140_000 : 130_000,
    });
    const n = await prisma.notification.findFirst({ where: { userId: passenger.user.id, type: 'ride:request:assigned' } });
    expect(n?.payload).toMatchObject({ phone: winner.user.phone, carModel: 'Chevrolet Cobalt' });
  });

  it("guruh navbati: mos haydovchi bo'lmasa darhol, bo'lsa kechikish bilan; olingandan keyin post yopiladi", async () => {
    const { c, passenger, d1 } = await setup();
    // Samarqand yo'nalishida haydovchi yo'q → darhol guruhga
    const sam = await prisma.city.create({ data: { nameUz: 'Samarqand', nameRu: 'Самарканд', region: 'Samarqand viloyati' } });
    const lonely = await createRequest(passenger.token, { fromCityId: c.toshkent.id, toCityId: sam.id, date: tashkentDay(1), seats: 1 });
    const routed = await createRequest(passenger.token, { fromCityId: c.toshkent.id, toCityId: c.andijon.id, date: tashkentDay(1), seats: 3 });

    const q1 = await request(app).get('/api/v1/internal/bot/ride-requests/group-queue').set(botHeaders());
    expect(q1.status).toBe(200);
    expect(q1.body.data.toPost.map((r: { requestId: string }) => r.requestId)).toEqual([lonely.body.data.id]);

    // 10 daqiqadan keyin mos haydovchi olmagan so'rov ham guruhga chiqadi
    const later = await rideRequestsService.groupQueue(Date.now() + 11 * 60_000);
    expect(later.toPost.map((r) => r.requestId).sort()).toEqual([lonely.body.data.id, routed.body.data.id].sort());

    const posted = await request(app)
      .post(`/api/v1/internal/bot/ride-requests/${routed.body.data.id}/group-posted`)
      .set(botHeaders())
      .send({ chatId: '-1001234567890', messageId: 55 });
    expect(posted.body.data.updated).toBe(1);

    await take(d1.token, routed.body.data.id);
    const q2 = await request(app).get('/api/v1/internal/bot/ride-requests/group-queue').set(botHeaders());
    expect(q2.body.data.toClose).toEqual([{ requestId: routed.body.data.id, status: 'ASSIGNED', chatId: '-1001234567890', messageId: 55 }]);
    await request(app).post(`/api/v1/internal/bot/ride-requests/${routed.body.data.id}/group-closed`).set(botHeaders()).send();
    const q3 = await request(app).get('/api/v1/internal/bot/ride-requests/group-queue').set(botHeaders());
    expect(q3.body.data.toClose).toEqual([]);
  });

  it('bot orqali olish: haydovchi emas → DRIVER_PROFILE_REQUIRED; haydovchi narx yozadi → yo\'lovchiga xabar', async () => {
    const { c, passenger, d1 } = await setup();
    const { body } = await createRequest(passenger.token, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(), seats: 2 });
    const id = body.data.id;

    const stranger = await request(app).post(`/api/v1/internal/bot/ride-requests/${id}/check`).set(botHeaders()).send({ telegramId: '999' });
    expect(stranger.body.error.code).toBe('DRIVER_PROFILE_REQUIRED');
    const self = await request(app).post(`/api/v1/internal/bot/ride-requests/${id}/check`).set(botHeaders()).send({ telegramId: '5001' });
    expect(self.status).toBe(403);

    const check = await request(app).post(`/api/v1/internal/bot/ride-requests/${id}/check`).set(botHeaders()).send({ telegramId: '7001' });
    expect(check.status).toBe(200);
    expect(check.body.data).toMatchObject({ requestId: id, seats: 2 });

    const res = await request(app).post(`/api/v1/internal/bot/ride-requests/${id}/take`).set(botHeaders()).send({ telegramId: '7001', pricePerSeat: 160_000 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ phone: passenger.user.phone, passengerName: 'Dilnoza Karimova', telegramUsername: 'dilnoza', pricePerSeat: 160_000 });
    const n = await prisma.notification.findFirst({ where: { userId: passenger.user.id, type: 'ride:request:assigned' } });
    expect(n?.payload).toMatchObject({ driverName: 'Sardor Aliyev', telegramUsername: 'sardor_taxi', pricePerSeat: 160_000 });
    // Bot haydovchiga o'zi javob beradi — takroriy bildirishnoma yo'q
    expect(await prisma.notification.count({ where: { userId: d1.user.id, type: 'ride:request:taken' } })).toBe(0);

    const again = await request(app).post(`/api/v1/internal/bot/ride-requests/${id}/check`).set(botHeaders()).send({ telegramId: '7001' });
    expect(again.body.error.code).toBe('RIDE_REQUEST_NOT_OPEN');
    expect((await request(app).get('/api/v1/internal/bot/ride-requests/group-queue')).status).toBe(401);
  });

  it("admin tizimda yo'q haydovchini qo'lda biriktiradi; amal jurnalga yoziladi", async () => {
    const { c, passenger } = await setup();
    const admin = await createUser({ role: 'ADMIN' });
    const { body } = await createRequest(passenger.token, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(), seats: 1 });

    const res = await request(app)
      .post(`/api/v1/admin/ride-requests/${body.data.id}/assign`)
      .set(bearer(admin.token))
      .send({ driverName: 'Jasur Toshmatov', driverPhone: '+998 90 123 45 67', carModel: 'Nexia 3', carColor: 'Qora', carPlate: '60 B 123 CA', pricePerSeat: 120_000 });
    expect(res.status).toBe(200);
    expect(res.body.data.manual).toBe(true);
    expect(res.body.data.passengerContact.phone).toBe(passenger.user.phone);

    const mine = await request(app).get('/api/v1/ride-requests/my').set(bearer(passenger.token));
    expect(mine.body.data[0].assignment).toMatchObject({ driverName: 'Jasur Toshmatov', phone: '+998901234567', carModel: 'Nexia 3' });
    expect(await prisma.auditLog.count({ where: { action: 'rideRequest.assign', targetId: body.data.id } })).toBe(1);

    const list = await request(app).get('/api/v1/admin/ride-requests?status=ASSIGNED').set(bearer(admin.token));
    expect(list.body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/admin/ride-requests').set(bearer(passenger.token))).status).toBe(403);
  });

  it("bekor qilish haydovchiga xabar beradi; limitlar va o'tgan sana", async () => {
    const { c, passenger, d1 } = await setup();
    const body = { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(1), seats: 1 };
    const first = await createRequest(passenger.token, body);
    await take(d1.token, first.body.data.id);

    const cancel = await request(app).post(`/api/v1/ride-requests/${first.body.data.id}/cancel`).set(bearer(passenger.token));
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect(await prisma.notification.count({ where: { userId: d1.user.id, type: 'ride:request:updated' } })).toBe(1);
    expect((await request(app).post(`/api/v1/ride-requests/${first.body.data.id}/cancel`).set(bearer(passenger.token))).status).toBe(409);

    for (let i = 0; i < 3; i++) expect((await createRequest(passenger.token, body)).status).toBe(201);
    expect((await createRequest(passenger.token, body)).body.error.code).toBe('TOO_MANY_RIDE_REQUESTS');

    const other = await createUser();
    expect((await createRequest(other.token, { ...body, date: tashkentDay(-1) })).body.error.code).toBe('RIDE_REQUEST_DATE_IN_PAST');
    // Begona so'rovni bekor qilib bo'lmaydi
    const own = await createRequest(other.token, body);
    expect((await request(app).post(`/api/v1/ride-requests/${own.body.data.id}/cancel`).set(bearer(passenger.token))).status).toBe(404);
  });

  it("bloklangan yo'lovchining so'rovlari bekor bo'ladi va sabab saqlanadi; bloklangan haydovchi ola olmaydi", async () => {
    const { c, passenger, d1, d2 } = await setup();
    const admin = await createUser({ role: 'ADMIN' });
    const body = { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(1), seats: 1 };
    const assigned = await createRequest(passenger.token, body);
    await take(d1.token, assigned.body.data.id);
    const open = await createRequest(passenger.token, body);

    const block = await request(app).post(`/api/v1/admin/users/${passenger.user.id}/block`).set(bearer(admin.token)).send({ reason: 'Haydovchini aldagan' });
    expect(block.status).toBe(200);
    const rows = await prisma.rideRequest.findMany({ where: { passengerId: passenger.user.id } });
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: passenger.user.id } })).blockReason).toBe('Haydovchini aldagan');
    expect(await prisma.notification.count({ where: { userId: d1.user.id, type: 'ride:request:updated' } })).toBe(1);
    expect((await createRequest(passenger.token, body)).body.error.code).toBe('USER_BLOCKED');
    expect(open.status).toBe(201);

    // Bloklangan haydovchi bot orqali ham ola olmaydi
    const other = await createUser({ telegramId: '5002' });
    const req2 = await createRequest(other.token, body);
    await request(app).post(`/api/v1/admin/users/${d2.user.id}/block`).set(bearer(admin.token)).send({});
    const res = await request(app).post(`/api/v1/internal/bot/ride-requests/${req2.body.data.id}/take`).set(botHeaders()).send({ telegramId: '7002', pricePerSeat: 100_000 });
    expect(res.body.error.code).toBe('USER_BLOCKED');
  });

  it("cron: sanasi o'tgan ochiq so'rovlar EXPIRED bo'ladi", async () => {
    const { c, passenger } = await setup();
    const { body } = await createRequest(passenger.token, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: tashkentDay(), seats: 1 });
    expect(await expireRideRequestsJob()).toBe(0);
    expect(await expireRideRequestsJob(new Date(Date.now() + 2 * 86_400_000))).toBe(1);
    expect((await prisma.rideRequest.findUniqueOrThrow({ where: { id: body.data.id } })).status).toBe('EXPIRED');
    expect(await prisma.notification.count({ where: { userId: passenger.user.id, type: 'ride:request:updated' } })).toBe(1);
  });
});
