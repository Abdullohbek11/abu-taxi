import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, botHeaders, createApprovedDriver, createCities, createTrip, createUser, makePng, mockStorage } from '../../test/helpers.js';
import { checkoutUrl, DEFAULT_BILLING, subscriptionReminders } from './billing.service.js';

const app = createApp();
const DAY = 86_400_000;
const SETTINGS = { ...DEFAULT_BILLING, enabled: true, price: 49_000, days: 30, cardNumber: '8600 1234 5678 9012', cardHolder: 'Abdulloh R.', telegramUsername: '@abutax_uz' };

async function setup(enabled = true) {
  const admin = await createUser({ role: 'ADMIN' });
  await request(app).put('/api/v1/admin/billing/settings').set(bearer(admin.token)).send({ ...SETTINGS, enabled }).expect(200);
  const c = await createCities();
  const driver = await createApprovedDriver();
  await prisma.user.update({ where: { id: driver.user.id }, data: { telegramId: '8801' } });
  const passenger = await createUser();
  return { admin, c, driver, passenger };
}

describe('Haydovchi tarifi (30 kun)', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it("tarif o'chiq bo'lsa (standart) — hamma narsa bepul ishlaydi", async () => {
    const c = await createCities();
    const driver = await createApprovedDriver();
    const passenger = await createUser();
    const trip = await createTrip(driver, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const b = await prisma.booking.create({ data: { tripId: trip.id, passengerId: passenger.user.id, seats: 1, totalPrice: 150_000 } });
    expect((await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(driver.token))).status).toBe(200);
    const plan = await request(app).get('/api/v1/billing/plan').set(bearer(driver.token));
    expect(plan.body.data.enabled).toBe(false);
  });

  it("tarif yoqilgan, obuna yo'q: bron tasdiqlash, so'rov olish, yukka taklif — 402; safar e'lon qilish bepul", async () => {
    const { c, driver, passenger } = await setup();
    const trip = await createTrip(driver, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const b = await prisma.booking.create({ data: { tripId: trip.id, passengerId: passenger.user.id, seats: 1, totalPrice: 150_000 } });
    const confirm = await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(driver.token));
    expect(confirm.status).toBe(402);
    expect(confirm.body.error.code).toBe('SUBSCRIPTION_REQUIRED');

    const rr = await prisma.rideRequest.create({ data: { passengerId: passenger.user.id, fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: new Date(Date.now() + DAY), seats: 1 } });
    expect((await request(app).post(`/api/v1/ride-requests/${rr.id}/take`).set(bearer(driver.token)).send({ pricePerSeat: 150_000 })).status).toBe(402);
    const bot = await request(app).post(`/api/v1/internal/bot/ride-requests/${rr.id}/check`).set(botHeaders()).send({ telegramId: '8801' });
    expect(bot.body.error.code).toBe('SUBSCRIPTION_REQUIRED');

    const cargo = await prisma.cargoRequest.create({ data: { senderId: passenger.user.id, type: 'OTHER', weightKg: 10, fromCityId: c.andijon.id, toCityId: c.toshkent.id, pickupAddress: 'A', dropoffAddress: 'B', date: new Date(Date.now() + DAY) } });
    expect((await request(app).post(`/api/v1/cargo/${cargo.id}/offers`).set(bearer(driver.token)).send({ price: 100_000 })).status).toBe(402);

    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { driverId: driver.profile.id } });
    const post = await request(app).post('/api/v1/trips').set(bearer(driver.token)).send({ vehicleId: vehicle.id, fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() + DAY).toISOString(), pricePerSeat: 150_000 });
    expect(post.status).toBe(201);
  });

  it("karta + chek → admin tasdiqlaydi → 30 kun ochiladi, haydovchiga xabar; keyingi to'lov tugash sanasidan uzaytiradi", async () => {
    const { admin, driver } = await setup();
    const plan = await request(app).get('/api/v1/billing/plan').set(bearer(driver.token));
    expect(plan.body.data).toMatchObject({ enabled: true, price: 49_000, days: 30, card: { number: '8600123456789012', holder: 'Abdulloh R.' }, telegramUsername: 'abutax_uz', subscription: { active: false } });

    const pay = await request(app).post('/api/v1/billing/payments').set(bearer(driver.token)).field('note', 'Kecha 21:00 da o‘tkazdim').attach('file', await makePng(800, 600), 'chek.png');
    expect(pay.status).toBe(201);
    expect(pay.body.data).toMatchObject({ status: 'PENDING', amount: 49_000, hasReceipt: true });
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'billing:payment:new' } })).toBe(1);
    // Ikkinchi chek — oldingisi tekshirilguncha mumkin emas
    expect((await request(app).post('/api/v1/billing/payments').set(bearer(driver.token)).field('note', 'yana')).body.error.code).toBe('PAYMENT_ALREADY_PENDING');

    const receipt = await request(app).get(`/api/v1/admin/payments/${pay.body.data.id}/receipt`).set(bearer(admin.token));
    expect(receipt.body.data.url).toContain('signed=1');

    const ok1 = await request(app).post(`/api/v1/admin/payments/${pay.body.data.id}/confirm`).set(bearer(admin.token));
    expect(ok1.status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/payments/${pay.body.data.id}/confirm`).set(bearer(admin.token))).status).toBe(409);
    const until1 = new Date(ok1.body.data.until).getTime();
    expect(Math.round((until1 - Date.now()) / DAY)).toBe(30);
    expect(await prisma.notification.count({ where: { userId: driver.user.id, type: 'billing:activated' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'payment.confirm' } })).toBe(1);

    // Obuna faol — endi yo'lovchini tasdiqlay oladi
    const after = await request(app).get('/api/v1/billing/plan').set(bearer(driver.token));
    expect(after.body.data.subscription.active).toBe(true);

    // Muddat tugamasdan to'lasa — tugash sanasidan yana 30 kun
    const pay2 = await request(app).post('/api/v1/billing/payments').set(bearer(driver.token)).field('note', 'keyingi oy');
    const ok2 = await request(app).post(`/api/v1/admin/payments/${pay2.body.data.id}/confirm`).set(bearer(admin.token));
    expect(Math.round((new Date(ok2.body.data.until).getTime() - until1) / DAY)).toBe(30);
  });

  it("rad etish sabab bilan; admin qo'lda obuna beradi (Telegram'da kelgan chek)", async () => {
    const { admin, driver } = await setup();
    const pay = await request(app).post('/api/v1/billing/payments').set(bearer(driver.token)).field('note', 'chek');
    await request(app).post(`/api/v1/admin/payments/${pay.body.data.id}/reject`).set(bearer(admin.token)).send({ reason: 'Pul tushmagan' }).expect(200);
    expect(await prisma.notification.count({ where: { userId: driver.user.id, type: 'billing:rejected' } })).toBe(1);

    const grant = await request(app).post(`/api/v1/admin/users/${driver.user.id}/subscription`).set(bearer(admin.token)).send({ days: 30, amount: 49_000, note: 'Chek Telegramda' });
    expect(grant.status).toBe(200);
    const list = await request(app).get('/api/v1/admin/payments?status=CONFIRMED').set(bearer(admin.token));
    expect(list.body.data[0]).toMatchObject({ method: 'ADMIN', amount: 49_000, user: { id: driver.user.id } });
    const overview = await request(app).get('/api/v1/admin/overview').set(bearer(admin.token));
    expect(overview.body.data.billing).toMatchObject({ enabled: true, activeSubscriptions: 1, revenue30d: 49_000 });
  });

  it("Payme / Click: merchant sozlanmagan — 409; sozlangan — to'lov sahifasi havolasi", async () => {
    const { admin, driver } = await setup();
    expect((await request(app).post('/api/v1/billing/payments/online').set(bearer(driver.token)).send({ provider: 'payme' })).body.error.code).toBe('PAYMENT_PROVIDER_DISABLED');
    await request(app).put('/api/v1/admin/billing/settings').set(bearer(admin.token)).send({ ...SETTINGS, paymeMerchantId: 'a'.repeat(24), clickServiceId: '123', clickMerchantId: '456' }).expect(200);
    const r = await request(app).post('/api/v1/billing/payments/online').set(bearer(driver.token)).send({ provider: 'payme' });
    expect(r.status).toBe(201);
    const decoded = Buffer.from(r.body.data.url.replace('https://checkout.paycom.uz/', ''), 'base64').toString();
    expect(decoded).toBe(`m=${'a'.repeat(24)};ac.order_id=${r.body.data.payment.id};a=4900000`);
    // Qayta bosish yangi yozuv yaratmaydi
    const again = await request(app).post('/api/v1/billing/payments/online').set(bearer(driver.token)).send({ provider: 'payme' });
    expect(again.body.data.payment.id).toBe(r.body.data.payment.id);
    expect(checkoutUrl('click', { ...SETTINGS, clickServiceId: '123', clickMerchantId: '456' }, { id: 'p1', amount: 49_000 })).toContain('service_id=123&merchant_id=456&amount=49000&transaction_param=p1');
  });

  it('sinov kunlari: yangi tasdiqlangan haydovchiga avtomatik; eslatmalar bir marta', async () => {
    const { admin } = await setup();
    await request(app).put('/api/v1/admin/billing/settings').set(bearer(admin.token)).send({ ...SETTINGS, trialDays: 7 }).expect(200);
    const u = await createUser({ role: 'DRIVER' });
    const profile = await prisma.driverProfile.create({ data: { userId: u.user.id } });
    await prisma.document.createMany({ data: [{ driverId: profile.id, type: 'LICENSE', fileKey: 'a' }, { driverId: profile.id, type: 'TECH_PASSPORT', fileKey: 'b' }] });
    await request(app).post(`/api/v1/admin/drivers/${profile.id}/approve`).set(bearer(admin.token)).expect(200);
    const p = await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(Math.round((p.subscriptionUntil!.getTime() - Date.now()) / DAY)).toBe(7);

    expect(await subscriptionReminders(new Date(Date.now() + 5 * DAY))).toBe(1);
    expect(await subscriptionReminders(new Date(Date.now() + 5 * DAY))).toBe(0);
    expect(await subscriptionReminders(new Date(Date.now() + 8 * DAY))).toBe(1);
    expect(await prisma.notification.count({ where: { userId: u.user.id, type: { in: ['billing:expiring', 'billing:expired'] } } })).toBe(2);
  });

  it("ruxsatlar: sozlama va tasdiqlash faqat admin; tarif sahifasi faqat haydovchi", async () => {
    const { driver, passenger } = await setup();
    expect((await request(app).put('/api/v1/admin/billing/settings').set(bearer(driver.token)).send(SETTINGS)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/users/x/subscription').set(bearer(driver.token)).send({ days: 30 })).status).toBe(403);
    expect((await request(app).get('/api/v1/billing/plan').set(bearer(passenger.token))).status).toBe(403);
  });
});
