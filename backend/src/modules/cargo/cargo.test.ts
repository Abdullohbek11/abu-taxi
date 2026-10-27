import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser, makePng, mockStorage } from '../../test/helpers.js';

const app = createApp();
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

async function setup() {
  const c = await createCities();
  const sender = await createUser({ role: 'SENDER', firstName: 'Mirjalol', lastName: 'Ahmedov', telegramUsername: 'mirjalol' });
  const d1 = await createApprovedDriver({ firstName: 'Sardor', acceptsCargo: true });
  const d2 = await createApprovedDriver({ firstName: 'Rustam', acceptsCargo: true });
  return { c, sender, d1, d2 };
}

async function createCargo(token: string, c: Awaited<ReturnType<typeof createCities>>, extra: object = {}) {
  const res = await request(app)
    .post('/api/v1/cargo')
    .set(bearer(token))
    .send({
      type: 'FURNITURE',
      weightKg: 120,
      lengthCm: 200,
      widthCm: 90,
      heightCm: 60,
      fromCityId: c.andijon.id,
      toCityId: c.toshkent.id,
      pickupAddress: "Andijon, Bobur shoh ko'chasi",
      dropoffAddress: 'Toshkent, Yunusobod',
      date: today(),
      offeredPrice: 400_000,
      ...extra,
    });
  return res;
}

const offer = (token: string, cargoId: string, body: object = { price: 380_000 }) =>
  request(app).post(`/api/v1/cargo/${cargoId}/offers`).set(bearer(token)).send(body);

describe("yuk so'rovlari", () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it("multipart rasmlar bilan yaratish", async () => {
    const { c, sender } = await setup();
    const res = await request(app)
      .post('/api/v1/cargo')
      .set(bearer(sender.token))
      .field('type', 'APPLIANCE')
      .field('weightKg', '65')
      .field('fromCityId', c.andijon.id)
      .field('toCityId', c.toshkent.id)
      .field('pickupAddress', 'Andijon, Navoiy 5')
      .field('dropoffAddress', 'Toshkent, Chilonzor')
      .field('date', today())
      .field('offeredPrice', '300000')
      .attach('photos', await makePng(800, 600), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'APPLIANCE', weightKg: 65, status: 'OPEN', offeredPrice: 300_000 });
    expect(res.body.data.photos).toHaveLength(1);
  });

  it("o'tgan sana — 400; noma'lum tur — 400", async () => {
    const { c, sender } = await setup();
    expect((await createCargo(sender.token, c, { date: '2020-01-01' })).body.error.code).toBe('CARGO_DATE_IN_PAST');
    expect((await createCargo(sender.token, c, { type: 'CAR' })).status).toBe(400);
  });

  it("haydovchilar uchun ochiq ro'yxat: filtrlar, o'ziniki ko'rinmaydi; yo'lovchi kira olmaydi", async () => {
    const { c, sender, d1 } = await setup();
    await createCargo(sender.token, c);
    await createCargo(sender.token, c, { type: 'FOOD', weightKg: 20 });
    await createCargo(d1.token, c, { type: 'OTHER', weightKg: 5 }); // haydovchining o'z yuki

    const all = await request(app).get('/api/v1/cargo/open').set(bearer(d1.token));
    expect(all.body.data).toHaveLength(2);
    expect(JSON.stringify(all.body)).not.toMatch(/\+998/);

    const light = await request(app).get(`/api/v1/cargo/open?maxWeightKg=50&from=${c.asaka.id}`).set(bearer(d1.token));
    expect(light.body.data.map((x: { type: string }) => x.type)).toEqual(['FOOD']);

    expect((await request(app).get('/api/v1/cargo/open').set(bearer(sender.token))).status).toBe(403);
  });

  it("taklif → qabul: qolganlari REJECTED, kontakt ikki tomonga ochiladi", async () => {
    const { c, sender, d1, d2 } = await setup();
    const cargo = (await createCargo(sender.token, c)).body.data;

    const o1 = (await offer(d1.token, cargo.id, { price: 380_000, message: 'Ertaga olib ketaman' })).body.data;
    const o2 = (await offer(d2.token, cargo.id, { price: 350_000 })).body.data;
    expect(o1).toMatchObject({ status: 'PENDING', contact: null });

    expect((await offer(d1.token, cargo.id)).body.error.code).toBe('OFFER_ALREADY_EXISTS');
    expect((await offer(sender.token, cargo.id)).status).toBe(403); // yuk jo'natuvchi haydovchi emas

    const list = await request(app).get(`/api/v1/cargo/${cargo.id}/offers`).set(bearer(sender.token));
    expect(list.body.data.map((o: { id: string }) => o.id)).toEqual([o2.id, o1.id]); // arzonroq birinchi
    expect(list.body.data.every((o: { contact: unknown }) => o.contact === null)).toBe(true);

    const acc = await request(app).post(`/api/v1/offers/${o1.id}/accept`).set(bearer(sender.token));
    expect(acc.status).toBe(200);
    expect(acc.body.data).toMatchObject({ status: 'ACCEPTED', contact: { phone: d1.user.phone } });
    expect((await prisma.cargoOffer.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe('REJECTED');

    const senderView = await request(app).get(`/api/v1/cargo/${cargo.id}`).set(bearer(sender.token));
    expect(senderView.body.data).toMatchObject({ status: 'MATCHED', contact: { phone: d1.user.phone } });

    const driverView = await request(app).get(`/api/v1/cargo/${cargo.id}`).set(bearer(d1.token));
    expect(driverView.body.data.contact).toEqual({ phone: sender.user.phone, telegramUsername: 'mirjalol' });

    const loserView = await request(app).get(`/api/v1/cargo/${cargo.id}`).set(bearer(d2.token));
    expect(loserView.body.data.contact).toBeNull();
    expect(loserView.body.data.acceptedOffer).toBeNull();

    // Yuk yopilgan: yangi taklif va ikkinchi qabul — rad
    const d3 = await createApprovedDriver();
    expect((await offer(d3.token, cargo.id)).body.error.code).toBe('CARGO_NOT_OPEN');
    expect((await request(app).post(`/api/v1/offers/${o2.id}/accept`).set(bearer(sender.token))).status).toBe(409);
  });

  it('ikki taklifni parallel qabul qilish — faqat bittasi ACCEPTED', async () => {
    const { c, sender, d1, d2 } = await setup();
    const cargo = (await createCargo(sender.token, c)).body.data;
    const o1 = (await offer(d1.token, cargo.id)).body.data;
    const o2 = (await offer(d2.token, cargo.id)).body.data;

    const results = await Promise.all([
      request(app).post(`/api/v1/offers/${o1.id}/accept`).set(bearer(sender.token)),
      request(app).post(`/api/v1/offers/${o2.id}/accept`).set(bearer(sender.token)),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.cargoOffer.count({ where: { cargoRequestId: cargo.id, status: 'ACCEPTED' } })).toBe(1);
  });

  it('yetkazish holatlari: IN_TRANSIT faqat haydovchi, DELIVERED; noto\'g\'ri o\'tish — 409', async () => {
    const { c, sender, d1, d2 } = await setup();
    const cargo = (await createCargo(sender.token, c)).body.data;
    const o1 = (await offer(d1.token, cargo.id)).body.data;
    await request(app).post(`/api/v1/offers/${o1.id}/accept`).set(bearer(sender.token)).expect(200);

    const status = (token: string, s: string) =>
      request(app).post(`/api/v1/cargo/${cargo.id}/status`).set(bearer(token)).send({ status: s });

    expect((await status(sender.token, 'IN_TRANSIT')).status).toBe(403);
    expect((await status(d2.token, 'IN_TRANSIT')).status).toBe(404);
    expect((await status(d1.token, 'DELIVERED')).status).toBe(409); // MATCHED → DELIVERED mumkin emas
    expect((await status(d1.token, 'IN_TRANSIT')).body.data.status).toBe('IN_TRANSIT');
    expect((await status(sender.token, 'DELIVERED')).body.data.status).toBe('DELIVERED');
    expect((await request(app).post(`/api/v1/cargo/${cargo.id}/cancel`).set(bearer(sender.token))).status).toBe(409);
  });

  it("taklifni qaytarib olish, rad etish, yukni bekor qilish", async () => {
    const { c, sender, d1, d2 } = await setup();
    const cargo = (await createCargo(sender.token, c)).body.data;
    const o1 = (await offer(d1.token, cargo.id)).body.data;
    const o2 = (await offer(d2.token, cargo.id)).body.data;

    expect((await request(app).post(`/api/v1/offers/${o1.id}/withdraw`).set(bearer(d2.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/offers/${o1.id}/withdraw`).set(bearer(d1.token))).body.data.status).toBe('WITHDRAWN');
    // Qaytarib olgandan keyin yangi taklif berish mumkin
    await offer(d1.token, cargo.id, { price: 360_000 }).expect(201);

    expect((await request(app).post(`/api/v1/offers/${o2.id}/reject`).set(bearer(sender.token))).body.data.status).toBe('REJECTED');

    const cancel = await request(app).post(`/api/v1/cargo/${cargo.id}/cancel`).set(bearer(sender.token));
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect(await prisma.cargoOffer.count({ where: { cargoRequestId: cargo.id, status: 'PENDING' } })).toBe(0);

    const mine = await request(app).get('/api/v1/cargo/my?status=past').set(bearer(sender.token));
    expect(mine.body.data).toHaveLength(1);
  });

  it("taklif safarga bog'lanishi mumkin — faqat yuk oladigan o'z safari", async () => {
    const { c, sender, d1 } = await setup();
    const cargo = (await createCargo(sender.token, c)).body.data;
    const noCargoTrip = await createTrip(d1, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, acceptsCargo: false });
    const trip = await createTrip(d1, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, acceptsCargo: true });

    expect((await offer(d1.token, cargo.id, { price: 300_000, tripId: noCargoTrip.id })).body.error.code).toBe('TRIP_NOT_ACCEPTING_CARGO');
    const ok = await offer(d1.token, cargo.id, { price: 300_000, tripId: trip.id });
    expect(ok.body.data.trip.id).toBe(trip.id);
  });
});

describe('yuk: xaritadagi nuqtalar', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it("nuqtalar faqat jo'natuvchi va qabul qilingan haydovchiga ko'rinadi; tashqi koordinata — 400", async () => {
    const { c, sender, d1, d2 } = await setup();
    const at = { pickupLat: 40.78, pickupLng: 72.34, dropoffLat: 41.3, dropoffLng: 69.24 };
    const cargo = (await createCargo(sender.token, c, at)).body.data;
    expect(cargo.location).toEqual(at);

    // Yuk yopilgach begona haydovchi uni umuman ko'rmaydi (404) — bu holda ham nuqta yo'q
    const view = async (token: string) => (await request(app).get(`/api/v1/cargo/${cargo.id}`).set(bearer(token))).body.data?.location ?? null;
    expect(await view(d1.token)).toBeNull(); // hali taklif qabul qilinmagan

    const o1 = (await offer(d1.token, cargo.id)).body.data;
    await request(app).post(`/api/v1/offers/${o1.id}/accept`).set(bearer(sender.token)).expect(200);
    expect(await view(d1.token)).toEqual(at);
    expect(await view(d2.token)).toBeNull();

    expect((await createCargo(sender.token, c, { pickupLat: 48.85, pickupLng: 2.35 })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await createCargo(sender.token, c, { dropoffLat: 41.3 })).body.error.code).toBe('VALIDATION_ERROR');
  });
});
