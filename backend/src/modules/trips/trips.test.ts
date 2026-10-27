import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { tashkentToUtc } from '../../lib/time.js';
import { resetDb } from '../../test/db.js';
import { bearer, createApprovedDriver, createCities, createTrip, createUser } from '../../test/helpers.js';

const app = createApp();
const H = 3600_000;

/** Ertangi sana (Toshkent) YYYY-MM-DD */
function tomorrow(): string {
  const d = new Date(Date.now() + 5 * H + 24 * H);
  return d.toISOString().slice(0, 10);
}

describe("safar e'lon qilish", () => {
  beforeEach(resetDb);

  it('tasdiqlangan haydovchi safar yaratadi', async () => {
    const { andijon, toshkent } = await createCities();
    const d = await createApprovedDriver({ seats: 4 });
    const res = await request(app)
      .post('/api/v1/trips')
      .set(bearer(d.token))
      .send({
        vehicleId: d.vehicle.id,
        fromCityId: andijon.id,
        toCityId: toshkent.id,
        departureAt: new Date(Date.now() + 10 * H).toISOString(),
        pricePerSeat: 150_000,
        pickupFromHome: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      totalSeats: 4,
      availableSeats: 4,
      status: 'SCHEDULED',
      from: { nameUz: 'Andijon' },
      to: { nameUz: 'Toshkent' },
      driver: { name: 'Bahodir A.' },
    });
  });

  it("tasdiqlanmagan haydovchi — 403; yo'lovchi — 403", async () => {
    const { andijon, toshkent } = await createCities();
    const d = await createApprovedDriver();
    await prisma.driverProfile.update({ where: { id: d.profile.id }, data: { status: 'PENDING' } });
    const body = {
      vehicleId: d.vehicle.id,
      fromCityId: andijon.id,
      toCityId: toshkent.id,
      departureAt: new Date(Date.now() + 10 * H).toISOString(),
      pricePerSeat: 150_000,
    };
    const res = await request(app).post('/api/v1/trips').set(bearer(d.token)).send(body);
    expect(res.body.error.code).toBe('DRIVER_NOT_APPROVED');

    const p = await createUser({ role: 'PASSENGER' });
    expect((await request(app).post('/api/v1/trips').set(bearer(p.token)).send(body)).status).toBe(403);
  });

  it("validatsiya: o'tgan vaqt, bir xil shahar, sig'imdan ko'p o'rin", async () => {
    const { andijon, toshkent } = await createCities();
    const d = await createApprovedDriver({ seats: 4 });
    const base = {
      vehicleId: d.vehicle.id,
      fromCityId: andijon.id,
      toCityId: toshkent.id,
      departureAt: new Date(Date.now() + 10 * H).toISOString(),
      pricePerSeat: 150_000,
    };
    const post = (b: object) => request(app).post('/api/v1/trips').set(bearer(d.token)).send({ ...base, ...b });

    expect((await post({ departureAt: new Date(Date.now() - H).toISOString() })).body.error.code).toBe('TRIP_DEPARTURE_IN_PAST');
    expect((await post({ toCityId: andijon.id })).body.error.code).toBe('SAME_CITY');
    expect((await post({ totalSeats: 6 })).body.error.code).toBe('SEATS_EXCEED_VEHICLE');
    expect((await post({ pricePerSeat: 500 })).status).toBe(400);
  });
});

describe('safar qidiruvi', () => {
  beforeEach(resetDb);

  async function setup() {
    const cities = await createCities();
    const a = await createApprovedDriver({ firstName: 'Ali' });
    const b = await createApprovedDriver({ firstName: 'Bobur' });
    await prisma.driverProfile.update({ where: { id: b.profile.id }, data: { ratingAvg: 4.9, ratingCount: 40, ratingScore: 4.833 } });
    await prisma.driverProfile.update({ where: { id: a.profile.id }, data: { ratingAvg: 4.2, ratingCount: 10, ratingScore: 4.233 } });
    const day = tomorrow();
    const t1 = await createTrip(a, { fromCityId: cities.andijon.id, toCityId: cities.toshkent.id, departureAt: tashkentToUtc(day, '06:00'), pricePerSeat: 180_000 });
    const t2 = await createTrip(b, { fromCityId: cities.asaka.id, toCityId: cities.toshkent.id, departureAt: tashkentToUtc(day, '09:00'), pricePerSeat: 120_000, pickupFromHome: true });
    const t3 = await createTrip(a, { fromCityId: cities.andijon.id, toCityId: cities.toshkent.id, departureAt: tashkentToUtc(day, '18:00'), pricePerSeat: 150_000, availableSeats: 1 });
    // Ko'rinmasligi kerak: teskari yo'nalish, bekor qilingan
    await createTrip(a, { fromCityId: cities.toshkent.id, toCityId: cities.andijon.id, departureAt: tashkentToUtc(day, '07:00') });
    await createTrip(b, { fromCityId: cities.andijon.id, toCityId: cities.toshkent.id, departureAt: tashkentToUtc(day, '10:00'), status: 'CANCELLED' });
    return { ...cities, t1, t2, t3, day };
  }

  const ids = (res: request.Response) => res.body.data.map((t: { id: string }) => t.id);

  it("viloyat bo'yicha, vaqt tartibida; telefon va to'liq raqam yo'q", async () => {
    const s = await setup();
    const res = await request(app).get(`/api/v1/trips?from=${s.andijon.id}&to=${s.toshkent.id}&date=${s.day}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([s.t1.id, s.t2.id, s.t3.id]);
    expect(res.body.data[0].vehicle.plateNumber).toMatch(/\*\*$/);
    expect(JSON.stringify(res.body)).not.toMatch(/\+998/);
  });

  it('exactCity, seats, vaqt oralig\'i, narx, uydan olib ketish', async () => {
    const s = await setup();
    const base = `/api/v1/trips?from=${s.andijon.id}&to=${s.toshkent.id}&date=${s.day}`;
    expect(ids(await request(app).get(`${base}&exactCity=true`))).toEqual([s.t1.id, s.t3.id]);
    expect(ids(await request(app).get(`${base}&seats=2`))).toEqual([s.t1.id, s.t2.id]);
    expect(ids(await request(app).get(`${base}&timeFrom=08:00&timeTo=18:00`))).toEqual([s.t2.id, s.t3.id]);
    expect(ids(await request(app).get(`${base}&minPrice=130000&maxPrice=170000`))).toEqual([s.t3.id]);
    expect(ids(await request(app).get(`${base}&pickupFromHome=true`))).toEqual([s.t2.id]);
  });

  it('saralash: narx va reyting', async () => {
    const s = await setup();
    const base = `/api/v1/trips?from=${s.andijon.id}&to=${s.toshkent.id}&date=${s.day}`;
    expect(ids(await request(app).get(`${base}&sort=price`))).toEqual([s.t2.id, s.t3.id, s.t1.id]);
    expect(ids(await request(app).get(`${base}&sort=rating`))).toEqual([s.t2.id, s.t1.id, s.t3.id]);
  });

  it('cursor pagination (narx bo\'yicha saralanganda ham)', async () => {
    const s = await setup();
    const base = `/api/v1/trips?from=${s.andijon.id}&to=${s.toshkent.id}&date=${s.day}&sort=price&limit=2`;
    const p1 = await request(app).get(base);
    expect(ids(p1)).toEqual([s.t2.id, s.t3.id]);
    expect(p1.body.meta.nextCursor).toBe(s.t3.id);
    const p2 = await request(app).get(`${base}&cursor=${p1.body.meta.nextCursor}`);
    expect(ids(p2)).toEqual([s.t1.id]);
    expect(p2.body.meta.nextCursor).toBeNull();
  });

  it("vaqt oralig'i sanasiz — 400", async () => {
    const s = await setup();
    const res = await request(app).get(`/api/v1/trips?from=${s.andijon.id}&to=${s.toshkent.id}&timeFrom=08:00`);
    expect(res.status).toBe(400);
    expect(res.body.error.fields.date).toBeDefined();
  });

  it('safar tafsiloti: haydovchi sharhlari bilan', async () => {
    const s = await setup();
    const res = await request(app).get(`/api/v1/trips/${s.t1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: s.t1.id, driver: { name: 'Ali A.' }, driverReviews: [] });
    expect((await request(app).get('/api/v1/trips/nope')).body.error.code).toBe('TRIP_NOT_FOUND');
  });
});

describe('safar holatlari', () => {
  beforeEach(resetDb);

  it("SCHEDULED → IN_PROGRESS → COMPLETED; noto'g'ri o'tish — 409", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() + H) });

    const early = await request(app).post(`/api/v1/trips/${trip.id}/complete`).set(bearer(d.token));
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_STATE_TRANSITION');

    await request(app).post(`/api/v1/trips/${trip.id}/start`).set(bearer(d.token)).expect(200);
    const done = await request(app).post(`/api/v1/trips/${trip.id}/complete`).set(bearer(d.token));
    expect(done.body.data.status).toBe('COMPLETED');
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: d.profile.id } })).tripsCount).toBe(1);

    const cancel = await request(app).post(`/api/v1/trips/${trip.id}/cancel`).set(bearer(d.token));
    expect(cancel.status).toBe(409);
  });

  it("jo'nashdan 2 soatdan ko'p oldin boshlab bo'lmaydi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, departureAt: new Date(Date.now() + 5 * H) });
    const res = await request(app).post(`/api/v1/trips/${trip.id}/start`).set(bearer(d.token));
    expect(res.body.error.code).toBe('TRIP_START_TOO_EARLY');
  });

  it("boshqa haydovchining safari — 404", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const other = await createApprovedDriver();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    const res = await request(app).post(`/api/v1/trips/${trip.id}/cancel`).set(bearer(other.token));
    expect(res.status).toBe(404);
  });

  it("tahrirlash: band qilish bo'lsa narx o'zgarmaydi, o'rinlar band qilinganlardan kam bo'lmaydi", async () => {
    const c = await createCities();
    const d = await createApprovedDriver({ seats: 4 });
    const p = await createUser();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id, availableSeats: 1 });
    await prisma.booking.create({ data: { tripId: trip.id, passengerId: p.user.id, seats: 3, totalPrice: 450_000, status: 'CONFIRMED' } });

    const price = await request(app).patch(`/api/v1/trips/${trip.id}`).set(bearer(d.token)).send({ pricePerSeat: 200_000 });
    expect(price.body.error.code).toBe('TRIP_HAS_BOOKINGS');

    const tooFew = await request(app).patch(`/api/v1/trips/${trip.id}`).set(bearer(d.token)).send({ totalSeats: 2 });
    expect(tooFew.body.error.code).toBe('SEATS_BELOW_BOOKED');

    const ok = await request(app).patch(`/api/v1/trips/${trip.id}`).set(bearer(d.token)).send({ totalSeats: 3, note: 'Yangi izoh' });
    expect(ok.body.data).toMatchObject({ totalSeats: 3, availableSeats: 0, note: 'Yangi izoh' });
  });

  it("bekor qilish faol band qilishlarni ham bekor qiladi; /trips/my filtrlari", async () => {
    const c = await createCities();
    const d = await createApprovedDriver();
    const p = await createUser();
    const trip = await createTrip(d, { fromCityId: c.andijon.id, toCityId: c.toshkent.id });
    await createTrip(d, { fromCityId: c.toshkent.id, toCityId: c.andijon.id });
    const b = await prisma.booking.create({ data: { tripId: trip.id, passengerId: p.user.id, seats: 1, totalPrice: 150_000 } });

    const active = await request(app).get('/api/v1/trips/my?status=active').set(bearer(d.token));
    expect(active.body.data).toHaveLength(2);
    expect(active.body.data[0].pendingBookings).toBe(1);
    expect(active.body.data[0].vehicle.plateNumber).not.toMatch(/\*/); // haydovchi o'z raqamini to'liq ko'radi

    await request(app).post(`/api/v1/trips/${trip.id}/cancel`).set(bearer(d.token)).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED');
    const cancelled = await request(app).get('/api/v1/trips/my?status=cancelled').set(bearer(d.token));
    expect(cancelled.body.data.map((t: { id: string }) => t.id)).toEqual([trip.id]);
  });
});
