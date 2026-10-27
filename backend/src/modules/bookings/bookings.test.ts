import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser, createUsers } from '../../test/helpers.js';

const app = createApp();
const H = 3600_000;

async function setup(opts: { seats?: number; departureInMs?: number } = {}) {
  const c = await createCities();
  const driver = await createApprovedDriver({ seats: opts.seats ?? 4 });
  await prisma.user.update({ where: { id: driver.user.id }, data: { telegramUsername: 'bahodir_taxi' } });
  const trip = await createTrip(driver, {
    fromCityId: c.andijon.id,
    toCityId: c.toshkent.id,
    departureAt: new Date(Date.now() + (opts.departureInMs ?? 24 * H)),
    pricePerSeat: 150_000,
  });
  const passenger = await createUser({ role: 'PASSENGER', firstName: 'Nilufar', lastName: 'Tursunova' });
  return { c, driver, trip, passenger };
}

const book = (token: string, body: object) => request(app).post('/api/v1/bookings').set(bearer(token)).send(body);
const seatsLeft = async (id: string) => (await prisma.trip.findUniqueOrThrow({ where: { id } })).availableSeats;

describe('band qilish', () => {
  beforeEach(resetDb);

  it("band qilish: o'rin kamayadi, narx hisoblanadi, kontakt yopiq", async () => {
    const { trip, passenger } = await setup();
    const res = await book(passenger.token, { tripId: trip.id, seats: 2, pickupAddress: "Bobur shoh ko'chasi 12" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ seats: 2, totalPrice: 300_000, status: 'PENDING', contact: null });
    expect(res.body.data.trip.vehicle.plateNumber).toMatch(/\*\*$/);
    expect(JSON.stringify(res.body)).not.toMatch(/\+998/);
    expect(await seatsLeft(trip.id)).toBe(2);
  });

  it("o'z safarini band qila olmaydi; to'lgan safar — TRIP_FULL; ikkinchi faol band qilish — 409", async () => {
    const { trip, driver, passenger } = await setup({ seats: 2 });
    expect((await book(driver.token, { tripId: trip.id, seats: 1 })).body.error.code).toBe('CANNOT_BOOK_OWN_TRIP');

    await book(passenger.token, { tripId: trip.id, seats: 1 }).expect(201);
    expect((await book(passenger.token, { tripId: trip.id, seats: 1 })).body.error.code).toBe('BOOKING_ALREADY_EXISTS');
    expect(await seatsLeft(trip.id)).toBe(1); // tranzaksiya orqaga qaytdi

    const other = await createUser();
    expect((await book(other.token, { tripId: trip.id, seats: 2 })).body.error.code).toBe('TRIP_FULL');
  });

  it("bekor qilingan / o'tib ketgan safar — TRIP_NOT_BOOKABLE", async () => {
    const { trip, passenger } = await setup();
    await prisma.trip.update({ where: { id: trip.id }, data: { status: 'CANCELLED' } });
    expect((await book(passenger.token, { tripId: trip.id, seats: 1 })).body.error.code).toBe('TRIP_NOT_BOOKABLE');
  });

  it("rolsiz foydalanuvchi — ROLE_REQUIRED; bloklangan — USER_BLOCKED", async () => {
    const { trip } = await setup();
    const noRole = await createUser({ role: null });
    expect((await book(noRole.token, { tripId: trip.id, seats: 1 })).body.error.code).toBe('ROLE_REQUIRED');
    const blocked = await createUser({ isBlocked: true });
    expect((await book(blocked.token, { tripId: trip.id, seats: 1 })).body.error.code).toBe('USER_BLOCKED');
  });
});

describe('parallel band qilish (overbooking yo\'q)', () => {
  beforeEach(resetDb);

  it("4 o'rinli safarga 20 kishi bir vaqtda — faqat 4 tasi muvaffaqiyatli", async () => {
    const { trip } = await setup({ seats: 4 });
    const users = await createUsers(20);

    const results = await Promise.all(users.map((u) => book(u.token, { tripId: trip.id, seats: 1 })));
    const okCount = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.body.error?.code === 'TRIP_FULL').length;

    expect(okCount).toBe(4);
    expect(full).toBe(16);
    expect(await seatsLeft(trip.id)).toBe(0);
    expect(await prisma.booking.count({ where: { tripId: trip.id } })).toBe(4);
  });

  it("aralash o'rin sonlari: jami band qilingan o'rinlar sig'imdan oshmaydi", async () => {
    const { trip } = await setup({ seats: 6 });
    const users = await createUsers(12);
    await Promise.all(users.map((u, i) => book(u.token, { tripId: trip.id, seats: (i % 3) + 1 })));

    const agg = await prisma.booking.aggregate({ where: { tripId: trip.id }, _sum: { seats: true } });
    const left = await seatsLeft(trip.id);
    expect((agg._sum.seats ?? 0) + left).toBe(6);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('bitta foydalanuvchi bir vaqtda 5 marta — faqat 1 ta band qilish', async () => {
    const { trip, passenger } = await setup({ seats: 4 });
    const results = await Promise.all(Array.from({ length: 5 }, () => book(passenger.token, { tripId: trip.id, seats: 1 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await seatsLeft(trip.id)).toBe(3);
  });

  it("parallel bekor qilish o'rinni faqat bir marta qaytaradi", async () => {
    const { trip, passenger } = await setup({ seats: 4 });
    const b = await book(passenger.token, { tripId: trip.id, seats: 2 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post(`/api/v1/bookings/${b.body.data.id}/cancel`).set(bearer(passenger.token))),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await seatsLeft(trip.id)).toBe(4);
  });
});

describe('holatlar va kontakt ochilishi', () => {
  beforeEach(resetDb);

  it('tasdiqlangandan keyin ikki tomon kontakti ochiladi', async () => {
    const { trip, driver, passenger } = await setup();
    const b = (await book(passenger.token, { tripId: trip.id, seats: 1 })).body.data;

    // Tasdiqlanmagan: haydovchi yo'lovchi raqamini ko'rmaydi
    const before = await request(app).get(`/api/v1/trips/${trip.id}/bookings`).set(bearer(driver.token));
    expect(before.body.data[0]).toMatchObject({ status: 'PENDING', contact: null, passenger: { name: 'Nilufar T.' } });

    const conf = await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(driver.token));
    expect(conf.status).toBe(200);
    expect(conf.body.data.contact).toEqual({ phone: passenger.user.phone, telegramUsername: null });

    const mine = await request(app).get('/api/v1/bookings/my').set(bearer(passenger.token));
    expect(mine.body.data[0].contact).toEqual({ phone: driver.user.phone, telegramUsername: 'bahodir_taxi' });
    expect(mine.body.data[0].trip.vehicle.plateNumber).toBe(driver.vehicle.plateNumber);

    const detail = await request(app).get(`/api/v1/trips/${trip.id}`).set(bearer(passenger.token));
    expect(detail.body.data.myBooking).toMatchObject({ status: 'CONFIRMED', contact: { phone: driver.user.phone } });
    expect(detail.body.data.myBooking.fullPlateNumber).toBe(driver.vehicle.plateNumber);

    // Boshqa foydalanuvchi uchun safar tafsilotida kontakt yo'q
    const stranger = await createUser();
    const s = await request(app).get(`/api/v1/trips/${trip.id}`).set(bearer(stranger.token));
    expect(s.body.data.myBooking).toBeNull();
    expect(JSON.stringify(s.body)).not.toContain(driver.user.phone!);
  });

  it("rad etish o'rinni qaytaradi; qayta tasdiqlash — 409", async () => {
    const { trip, driver, passenger } = await setup();
    const b = (await book(passenger.token, { tripId: trip.id, seats: 3 })).body.data;
    expect(await seatsLeft(trip.id)).toBe(1);

    await request(app).post(`/api/v1/bookings/${b.id}/reject`).set(bearer(driver.token)).expect(200);
    expect(await seatsLeft(trip.id)).toBe(4);

    const again = await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(driver.token));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');

    // Rad etilgandan keyin qayta band qilish mumkin
    await book(passenger.token, { tripId: trip.id, seats: 1 }).expect(201);
  });

  it("boshqa haydovchi tasdiqlay olmaydi; yo'lovchi boshqa odamning band qilishini bekor qila olmaydi", async () => {
    const { trip, passenger } = await setup();
    const b = (await book(passenger.token, { tripId: trip.id, seats: 1 })).body.data;
    const otherDriver = await createApprovedDriver();
    expect((await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(otherDriver.token))).status).toBe(404);
    const other = await createUser();
    expect((await request(app).post(`/api/v1/bookings/${b.id}/cancel`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/bookings/${b.id}/confirm`).set(bearer(passenger.token))).status).toBe(403);
  });

  it("jo'nashga 2 soatdan kam qolganda bekor qilish — cancelledLate", async () => {
    const early = await setup({ departureInMs: 5 * H });
    const b1 = (await book(early.passenger.token, { tripId: early.trip.id, seats: 1 })).body.data;
    const r1 = await request(app).post(`/api/v1/bookings/${b1.id}/cancel`).set(bearer(early.passenger.token));
    expect(r1.body.data).toMatchObject({ status: 'CANCELLED', cancelledLate: false });

    await resetDb();
    const late = await setup({ departureInMs: H });
    const b2 = (await book(late.passenger.token, { tripId: late.trip.id, seats: 1 })).body.data;
    const r2 = await request(app).post(`/api/v1/bookings/${b2.id}/cancel`).set(bearer(late.passenger.token));
    expect(r2.body.data).toMatchObject({ status: 'CANCELLED', cancelledLate: true });
  });

  it("safar boshlanganda PENDING rad etiladi, yakunlanganda CONFIRMED → COMPLETED", async () => {
    const { trip, driver, passenger } = await setup({ departureInMs: H });
    const p2 = await createUser();
    const b1 = (await book(passenger.token, { tripId: trip.id, seats: 1 })).body.data;
    const b2 = (await book(p2.token, { tripId: trip.id, seats: 2 })).body.data;
    await request(app).post(`/api/v1/bookings/${b1.id}/confirm`).set(bearer(driver.token)).expect(200);

    await request(app).post(`/api/v1/trips/${trip.id}/start`).set(bearer(driver.token)).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe('REJECTED');
    expect(await seatsLeft(trip.id)).toBe(3);

    // Safar boshlangandan keyin yo'lovchi bekor qila olmaydi
    expect((await request(app).post(`/api/v1/bookings/${b1.id}/cancel`).set(bearer(passenger.token))).status).toBe(409);

    await request(app).post(`/api/v1/trips/${trip.id}/complete`).set(bearer(driver.token)).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b1.id } })).status).toBe('COMPLETED');

    const past = await request(app).get('/api/v1/bookings/my?status=past').set(bearer(passenger.token));
    expect(past.body.data[0]).toMatchObject({ status: 'COMPLETED', contact: { phone: driver.user.phone } });
  });
});

describe("o'rin tanlash", () => {
  beforeEach(resetDb);

  it("haydovchi har o'ringa narx qo'yadi; yo'lovchi o'rinni tanlaydi — narx yig'indisi, o'rin band ko'rinadi", async () => {
    const { trip, passenger } = await setup();
    await prisma.trip.update({ where: { id: trip.id }, data: { seatPrices: [200_000, 150_000, 150_000, 150_000] } });

    const before = await request(app).get(`/api/v1/trips/${trip.id}`).expect(200);
    expect(before.body.data).toMatchObject({ seatPrices: [200_000, 150_000, 150_000, 150_000], takenSeats: [] });

    const res = await book(passenger.token, { tripId: trip.id, seatNumbers: [3, 1] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ seats: 2, seatNumbers: [1, 3], totalPrice: 350_000 });
    expect(await seatsLeft(trip.id)).toBe(2);

    const after = await request(app).get(`/api/v1/trips/${trip.id}`).expect(200);
    expect(after.body.data.takenSeats).toEqual([1, 3]);

    // Band o'rin — SEAT_TAKEN, mavjud bo'lmagan o'rin — SEAT_INVALID
    const other = await createUser();
    expect((await book(other.token, { tripId: trip.id, seatNumbers: [1] })).body.error.code).toBe('SEAT_TAKEN');
    expect((await book(other.token, { tripId: trip.id, seatNumbers: [5] })).body.error.code).toBe('SEAT_INVALID');
    expect((await book(other.token, { tripId: trip.id, seatNumbers: [2, 2] })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await book(other.token, { tripId: trip.id, seats: 1, seatNumbers: [2, 4] })).body.error.code).toBe('VALIDATION_ERROR');

    // O'rin ko'rsatilmasa — eng kichik raqamli bo'sh o'rinlar
    const auto = await book(other.token, { tripId: trip.id, seats: 1 }).expect(201);
    expect(auto.body.data).toMatchObject({ seatNumbers: [2], totalPrice: 150_000 });
  });

  it("bekor qilingan band qilishning o'rni yana bo'shaydi", async () => {
    const { trip, passenger } = await setup();
    const res = await book(passenger.token, { tripId: trip.id, seatNumbers: [1] }).expect(201);
    await request(app).post(`/api/v1/bookings/${res.body.data.id}/cancel`).set(bearer(passenger.token)).expect(200);
    const detail = await request(app).get(`/api/v1/trips/${trip.id}`).expect(200);
    expect(detail.body.data.takenSeats).toEqual([]);
    const other = await createUser();
    await book(other.token, { tripId: trip.id, seatNumbers: [1] }).expect(201);
  });

  it("bitta o'ringa 10 kishi bir vaqtda — faqat bittasi oladi", async () => {
    const { trip } = await setup();
    const users = await createUsers(10);
    const results = await Promise.all(users.map((u) => book(u.token, { tripId: trip.id, seatNumbers: [1] })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === 'SEAT_TAKEN')).toHaveLength(9);
    expect(await seatsLeft(trip.id)).toBe(3);
  });
});

describe("safar: o'rin narxlari", () => {
  beforeEach(resetDb);

  const post = (token: string, body: object) => request(app).post('/api/v1/trips').set(bearer(token)).send(body);
  const base = (c: Awaited<ReturnType<typeof createCities>>, vehicleId: string) => ({
    vehicleId,
    fromCityId: c.andijon.id,
    toCityId: c.toshkent.id,
    departureAt: new Date(Date.now() + 24 * H).toISOString(),
  });

  it("seatPrices bilan e'lon: pricePerSeat — eng arzoni; uzunlik mos kelmasa — 400; narxsiz — 400", async () => {
    const c = await createCities();
    const driver = await createApprovedDriver({ seats: 4 });
    const res = await post(driver.token, { ...base(c, driver.vehicle.id), seatPrices: [180_000, 140_000, 150_000, 140_000] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ pricePerSeat: 140_000, seatPrices: [180_000, 140_000, 150_000, 140_000] });

    const same = await post(driver.token, { ...base(c, driver.vehicle.id), pricePerSeat: 150_000 }).expect(201);
    expect(same.body.data.seatPrices).toEqual([150_000, 150_000, 150_000, 150_000]);

    expect((await post(driver.token, { ...base(c, driver.vehicle.id), seatPrices: [150_000, 150_000] })).body.error.code).toBe('SEAT_PRICES_MISMATCH');
    expect((await post(driver.token, base(c, driver.vehicle.id))).body.error.code).toBe('VALIDATION_ERROR');
  });

  it("o'rinlar sonini band o'rindan kam qilib bo'lmaydi; narxlar yangi songa moslanadi", async () => {
    const { trip, driver, passenger } = await setup();
    await prisma.trip.update({ where: { id: trip.id }, data: { seatPrices: [200_000, 150_000, 150_000, 120_000] } });
    await book(passenger.token, { tripId: trip.id, seatNumbers: [3] }).expect(201);

    const patch = (body: object) => request(app).patch(`/api/v1/trips/${trip.id}`).set(bearer(driver.token)).send(body);
    expect((await patch({ totalSeats: 2 })).body.error.code).toBe('SEATS_BELOW_BOOKED');
    const ok = await patch({ totalSeats: 3 }).expect(200);
    expect(ok.body.data).toMatchObject({ totalSeats: 3, availableSeats: 2, seatPrices: [200_000, 150_000, 150_000], pricePerSeat: 150_000 });
    // Band qilish bor — narxni o'zgartirib bo'lmaydi
    expect((await patch({ seatPrices: [100_000, 100_000, 100_000] })).body.error.code).toBe('TRIP_HAS_BOOKINGS');
  });
});

describe('joylashuv (xaritadagi nuqta)', () => {
  beforeEach(resetDb);

  it("olib ketish va tushirish nuqtasi saqlanadi; haydovchi aniq nuqtani faqat tasdiqlagach ko'radi", async () => {
    const { trip, driver, passenger } = await setup();
    const res = await book(passenger.token, {
      tripId: trip.id,
      seatNumbers: [2],
      pickupAddress: "Bobur ko'chasi 12",
      pickupLat: 40.7821,
      pickupLng: 72.3442,
      dropoffAddress: 'Chilonzor 9-kvartal',
      dropoffLat: 41.2856,
      dropoffLng: 69.2034,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ pickupLat: 40.7821, dropoffAddress: 'Chilonzor 9-kvartal', dropoffLat: 41.2856, dropoffLng: 69.2034 });

    const list = () => request(app).get(`/api/v1/trips/${trip.id}/bookings`).set(bearer(driver.token)).expect(200);
    const pending = (await list()).body.data[0];
    expect(pending).toMatchObject({ pickupAddress: "Bobur ko'chasi 12", dropoffAddress: 'Chilonzor 9-kvartal', pickupLat: null, dropoffLat: null });

    await request(app).post(`/api/v1/bookings/${res.body.data.id}/confirm`).set(bearer(driver.token)).expect(200);
    expect((await list()).body.data[0]).toMatchObject({ pickupLat: 40.7821, pickupLng: 72.3442, dropoffLat: 41.2856 });
  });

  it("O'zbekistondan tashqaridagi yoki juftsiz koordinata — VALIDATION_ERROR", async () => {
    const { trip, passenger } = await setup();
    const err = async (body: object) => (await book(passenger.token, { tripId: trip.id, seats: 1, ...body })).body.error.code;
    expect(await err({ dropoffLat: 55.75, dropoffLng: 37.61 })).toBe('VALIDATION_ERROR'); // Moskva
    expect(await err({ dropoffLat: 41.3 })).toBe('VALIDATION_ERROR');
    expect(await err({ pickupLng: 69.2 })).toBe('VALIDATION_ERROR');
  });
});

describe("tasdiqlanmagan so'rovlar tepada", () => {
  beforeEach(resetDb);

  it("haydovchi: barcha safarlaridagi kutilayotgan so'rovlar; ro'yxatlarda PENDING birinchi", async () => {
    const { trip, driver, passenger } = await setup();
    const [p2, p3] = await createUsers(2);
    const b1 = (await book(passenger.token, { tripId: trip.id, seatNumbers: [1] }).expect(201)).body.data;
    const b2 = (await book(p2!.token, { tripId: trip.id, seatNumbers: [2] }).expect(201)).body.data;
    await request(app).post(`/api/v1/bookings/${b1.id}/confirm`).set(bearer(driver.token)).expect(200);
    const b3 = (await book(p3!.token, { tripId: trip.id, seatNumbers: [3] }).expect(201)).body.data;

    const pending = await request(app).get('/api/v1/bookings/pending-for-driver').set(bearer(driver.token)).expect(200);
    expect(pending.body.data.map((b: { id: string }) => b.id)).toEqual([b2.id, b3.id]); // eng uzoq kutayotgani birinchi
    expect(pending.body.data[0]).toMatchObject({ status: 'PENDING', contact: null, seatNumbers: [2], trip: { id: trip.id } });

    const list = await request(app).get(`/api/v1/trips/${trip.id}/bookings`).set(bearer(driver.token)).expect(200);
    expect(list.body.data.map((b: { status: string }) => b.status)).toEqual(['PENDING', 'PENDING', 'CONFIRMED']);

    // Yo'lovchi uchun bu endpoint yopiq
    expect((await request(app).get('/api/v1/bookings/pending-for-driver').set(bearer(passenger.token))).status).toBe(403);
  });
});
