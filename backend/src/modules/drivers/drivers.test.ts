import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, createUser, makePng, mockStorage } from '../../test/helpers.js';

const app = createApp();

async function registerDriver() {
  const { user, token } = await createUser({ role: 'PASSENGER' });
  const res = await request(app)
    .post('/api/v1/drivers/register')
    .set(bearer(token))
    .send({ firstName: 'Sardor', lastName: 'Rahimov' });
  return { user, token, res };
}

describe("haydovchi ro'yxatdan o'tishi va hujjatlar", () => {
  let files: Map<string, Buffer>;
  beforeEach(async () => {
    await resetDb();
    files = mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it("ro'yxatdan o'tish: PENDING profil, rol DRIVER", async () => {
    const { res, token } = await registerDriver();
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DRIVER');
    expect(res.body.data.driverProfile.status).toBe('PENDING');

    const again = await request(app).post('/api/v1/drivers/register').set(bearer(token)).send({ firstName: 'A', lastName: 'B' });
    expect(again.status).toBe(400); // ism kamida 2 belgi
    const dup = await request(app).post('/api/v1/drivers/register').set(bearer(token)).send({ firstName: 'Ali', lastName: 'Bek' });
    expect(dup.body.error.code).toBe('DRIVER_ALREADY_REGISTERED');
  });

  it("hujjat: WEBP'ga o'tkaziladi, 1600px gacha kichraytiriladi, private bucket", async () => {
    const { token } = await registerDriver();
    const res = await request(app)
      .post('/api/v1/drivers/me/documents')
      .set(bearer(token))
      .field('type', 'LICENSE')
      .attach('file', await makePng(2400, 1800), { filename: 'license.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: 'LICENSE', status: 'PENDING' });
    expect(res.body.data.url).toContain('signed=1');
    expect(res.body.data.fileKey).toBeUndefined();

    const [key, body] = [...files.entries()][0]!;
    expect(key.startsWith('private/drivers/')).toBe(true);
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1200);
  });

  it("shu turdagi hujjat qayta yuklansa eskisi almashtiriladi", async () => {
    const { token } = await registerDriver();
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/api/v1/drivers/me/documents')
        .set(bearer(token))
        .field('type', 'TECH_PASSPORT')
        .attach('file', await makePng(400, 300), { filename: 'tp.png', contentType: 'image/png' })
        .expect(201);
    }
    expect(await prisma.document.count()).toBe(1);
    expect(files.size).toBe(1);
  });

  it("rasm emas (soxta MIME) — 415; 5MB dan katta — 413; faylsiz — 400", async () => {
    const { token } = await registerDriver();
    const fake = await request(app)
      .post('/api/v1/drivers/me/documents')
      .set(bearer(token))
      .field('type', 'LICENSE')
      .attach('file', Buffer.from('bu rasm emas'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');

    const pdf = await request(app)
      .post('/api/v1/drivers/me/documents')
      .set(bearer(token))
      .field('type', 'LICENSE')
      .attach('file', Buffer.from('%PDF'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(415);

    const big = await request(app)
      .post('/api/v1/drivers/me/documents')
      .set(bearer(token))
      .field('type', 'LICENSE')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(big.status).toBe(413);

    const none = await request(app).post('/api/v1/drivers/me/documents').set(bearer(token)).field('type', 'LICENSE');
    expect(none.body.error.code).toBe('FILE_REQUIRED');
  });

  it("yo'lovchi /drivers/me ga kira olmaydi", async () => {
    const { token } = await createUser({ role: 'PASSENGER' });
    const res = await request(app).get('/api/v1/drivers/me').set(bearer(token));
    expect(res.status).toBe(403);
  });
});

describe('mashinalar', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it('CRUD, raqam normallashtiriladi, takror raqam — 409', async () => {
    const { token } = await registerDriver();
    const create = await request(app)
      .post('/api/v1/vehicles')
      .set(bearer(token))
      .send({ model: 'Chevrolet Labo', color: 'Oq', plateNumber: '60l412sa', seats: 2, acceptsCargo: true });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ plateNumber: '60 L 412 SA', status: 'PENDING' });
    const id = create.body.data.id;

    const other = await registerDriver();
    const dup = await request(app)
      .post('/api/v1/vehicles')
      .set(bearer(other.token))
      .send({ model: 'Labo', color: 'Oq', plateNumber: '60 L 412 SA', seats: 2 });
    expect(dup.body.error.code).toBe('VEHICLE_PLATE_TAKEN');

    // Boshqa haydovchi o'zganing mashinasini ko'ra olmaydi
    expect((await request(app).get(`/api/v1/vehicles/${id}`).set(bearer(other.token))).status).toBe(404);

    const upd = await request(app).patch(`/api/v1/vehicles/${id}`).set(bearer(token)).send({ color: 'Kulrang' });
    expect(upd.body.data.color).toBe('Kulrang');

    const photos = await request(app)
      .post(`/api/v1/vehicles/${id}/photos`)
      .set(bearer(token))
      .attach('photos', await makePng(800, 600), { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', await makePng(800, 600), { filename: 'b.png', contentType: 'image/png' });
    expect(photos.status).toBe(200);
    expect(photos.body.data.photos).toHaveLength(2);

    const delPhoto = await request(app).delete(`/api/v1/vehicles/${id}/photos/0`).set(bearer(token));
    expect(delPhoto.body.data.photos).toHaveLength(1);

    expect((await request(app).get('/api/v1/vehicles').set(bearer(token))).body.data).toHaveLength(1);
    await request(app).delete(`/api/v1/vehicles/${id}`).set(bearer(token)).expect(200);
    expect(await prisma.vehicle.count()).toBe(0);
  });

  it("noto'g'ri raqam formati — 400", async () => {
    const { token } = await registerDriver();
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set(bearer(token))
      .send({ model: 'Cobalt', color: 'Oq', plateNumber: 'ABC', seats: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.plateNumber).toBe('Davlat raqami formati: 01 A 777 BA');
  });
});

describe('admin: haydovchilarni tasdiqlash', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  async function pendingDriverWithStuff() {
    const d = await registerDriver();
    for (const type of ['LICENSE', 'TECH_PASSPORT']) {
      await request(app)
        .post('/api/v1/drivers/me/documents')
        .set(bearer(d.token))
        .field('type', type)
        .attach('file', await makePng(400, 300), { filename: 'l.png', contentType: 'image/png' })
        .expect(201);
    }
    await request(app)
      .post('/api/v1/vehicles')
      .set(bearer(d.token))
      .send({ model: 'Cobalt', color: 'Oq', plateNumber: '01 A 777 BA', seats: 4 })
      .expect(201);
    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: d.user.id } });
    return { ...d, profile };
  }

  it("oddiy foydalanuvchi admin API'ga kira olmaydi", async () => {
    const { token } = await createUser({ role: 'DRIVER' });
    const res = await request(app).get('/api/v1/admin/drivers').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it("ro'yxat → tasdiqlash: profil, hujjat va mashina APPROVED", async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const d = await pendingDriverWithStuff();

    const list = await request(app).get('/api/v1/admin/drivers?status=PENDING').set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].user.phone).toBe(d.user.phone); // admin telefonni ko'radi
    expect(list.body.meta).toEqual({ nextCursor: null });

    const docId = list.body.data[0].documents[0].id;
    const doc = await request(app).get(`/api/v1/admin/documents/${docId}`).set(bearer(admin.token));
    expect(doc.body.data).toMatchObject({ type: 'LICENSE', expiresIn: 600 });
    expect(doc.body.data.url).toContain('signed=1');

    await request(app).post(`/api/v1/admin/drivers/${d.profile.id}/approve`).set(bearer(admin.token)).expect(200);
    const me = await request(app).get('/api/v1/drivers/me').set(bearer(d.token));
    expect(me.body.data.status).toBe('APPROVED');
    expect(me.body.data.vehicles[0].status).toBe('APPROVED');
    expect(me.body.data.documents.map((x: { status: string }) => x.status)).toEqual(['APPROVED', 'APPROVED']);

    // Hujjatni ko'rish va tasdiqlash audit jurnaliga yozilgan
    const auditLog = await request(app).get('/api/v1/admin/audit').set(bearer(admin.token));
    expect(auditLog.body.data.map((a: { action: string }) => a.action).sort()).toEqual(['document.view', 'driver.approve']);
  });

  it("hujjatlarsiz haydovchini tasdiqlab bo'lmaydi", async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const d = await registerDriver();
    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: d.user.id } });
    const res = await request(app).post(`/api/v1/admin/drivers/${profile.id}/approve`).set(bearer(admin.token));
    expect(res.body.error.code).toBe('DRIVER_DOCUMENTS_MISSING');
  });

  it('rad etish sababi bilan; hujjat qayta yuklansa PENDING ga qaytadi', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const d = await pendingDriverWithStuff();

    const rej = await request(app)
      .post(`/api/v1/admin/drivers/${d.profile.id}/reject`)
      .set(bearer(admin.token))
      .send({ reason: "Guvohnoma rasmi xira" });
    expect(rej.body.data).toMatchObject({ status: 'REJECTED', rejectReason: 'Guvohnoma rasmi xira' });

    await request(app)
      .post('/api/v1/drivers/me/documents')
      .set(bearer(d.token))
      .field('type', 'LICENSE')
      .attach('file', await makePng(400, 300), { filename: 'l.png', contentType: 'image/png' })
      .expect(201);
    const me = await request(app).get('/api/v1/drivers/me').set(bearer(d.token));
    expect(me.body.data).toMatchObject({ status: 'PENDING', rejectReason: null });
  });

  it('bloklash: sessiyalar bekor, yozish taqiqlanadi; adminni bloklab bo\'lmaydi', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const victim = await createUser({ role: 'PASSENGER' });
    await prisma.refreshToken.create({
      data: { userId: victim.user.id, tokenHash: 'x', expiresAt: new Date(Date.now() + 1e6) },
    });

    await request(app).post(`/api/v1/admin/users/${victim.user.id}/block`).set(bearer(admin.token)).expect(200);
    expect(await prisma.refreshToken.count({ where: { userId: victim.user.id, revokedAt: null } })).toBe(0);
    const w = await request(app).patch('/api/v1/users/me').set(bearer(victim.token)).send({ firstName: 'X' });
    expect(w.body.error.code).toBe('USER_BLOCKED');

    await request(app).post(`/api/v1/admin/users/${victim.user.id}/unblock`).set(bearer(admin.token)).expect(200);
    expect((await request(app).patch('/api/v1/users/me').set(bearer(victim.token)).send({ firstName: 'Xon' })).status).toBe(200);

    const other = await createUser({ role: 'ADMIN' });
    const res = await request(app).post(`/api/v1/admin/users/${other.user.id}/block`).set(bearer(admin.token));
    expect(res.body.error.code).toBe('CANNOT_BLOCK_ADMIN');
  });
});

describe('avatar', () => {
  beforeEach(async () => {
    await resetDb();
    mockStorage();
  });
  afterEach(() => vi.restoreAllMocks());

  it("avatar public URL bilan saqlanadi", async () => {
    const { token } = await createUser();
    const res = await request(app)
      .post('/api/v1/users/me/avatar')
      .set(bearer(token))
      .attach('file', await makePng(500, 500), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toMatch(/^http:\/\/cdn\.test\/avatars\/.+\.webp$/);
  });
});
