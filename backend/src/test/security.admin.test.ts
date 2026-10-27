import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { csvCell } from '../modules/admin/admin.data.service.js';
import { resetDb } from './db.js';
import { bearer, createCities, createUser } from './helpers.js';

const app = createApp();
const PASSWORD = 'Kuchli-parol-2026';
const login = (body: object) => request(app).post('/api/v1/auth/admin/login').send(body);

async function admin(opts: { password?: string | null; isBlocked?: boolean; role?: 'ADMIN' | 'PASSENGER' } = {}) {
  const pw = opts.password === undefined ? PASSWORD : opts.password;
  return createUser({
    role: opts.role ?? 'ADMIN',
    isBlocked: opts.isBlocked ?? false,
    passwordHash: pw ? await hashPassword(pw) : null,
  });
}

describe('Admin panel: parol bilan kirish', () => {
  beforeEach(resetDb);

  it("to'g'ri parol — sessiya (httpOnly cookie), jurnal va Telegram ogohlantirishi", async () => {
    const a = await admin();
    const res = await login({ login: a.user.phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(await prisma.auditLog.count({ where: { action: 'admin.login', adminId: a.user.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: a.user.id, type: 'security:admin-login' } })).toBe(1);
    // Access token haqiqatan admin endpointlarini ochadi
    expect((await request(app).get('/api/v1/admin/overview').set(bearer(res.body.data.accessToken))).status).toBe(200);
  });

  it("sabab oshkor qilinmaydi: noto'g'ri parol, yo'q hisob, admin emas, parolsiz admin, bloklangan — hammasi bir xil 401", async () => {
    const a = await admin();
    const notAdmin = await admin({ role: 'PASSENGER' });
    const noPassword = await admin({ password: null });
    const blocked = await admin({ isBlocked: true });
    const cases = [
      { login: a.user.phone, password: 'Notogri-parol-2026' },
      { login: '+998909999999', password: PASSWORD },
      { login: notAdmin.user.phone, password: PASSWORD },
      { login: noPassword.user.phone, password: PASSWORD },
      { login: blocked.user.phone, password: PASSWORD },
    ];
    for (const body of cases) {
      const res = await login(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ADMIN_LOGIN_INVALID');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it("brute force: 5 ta noto'g'ri paroldan keyin hisob qulflanadi — to'g'ri parol ham o'tmaydi", async () => {
    const a = await admin();
    for (let i = 0; i < 5; i++) expect((await login({ login: a.user.phone, password: `Xato-parol-${i}0000` })).status).toBe(401);
    const locked = await login({ login: a.user.phone, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ADMIN_LOGIN_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    // Mavjud bo'lmagan login ham xuddi shunday qulflanadi — qulf orqali admin borligini bilib bo'lmaydi
    for (let i = 0; i < 5; i++) await login({ login: '+998909999998', password: `Xato-parol-${i}0000` });
    expect((await login({ login: '+998909999998', password: PASSWORD })).body.error.code).toBe('ADMIN_LOGIN_LOCKED');
  });

  it('bitta IP dan 15 daqiqada 10 tadan ortiq urinish — 429 (turli loginlar bilan ham)', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await login({ login: `+99890100${String(i).padStart(4, '0')}`, password: 'Xato-parol-00000' })).status;
    expect(last).toBe(429);
  });

  it("parolni almashtirish: joriy parol majburiy, kuchsiz parol rad etiladi, eski sessiyalar yopiladi", async () => {
    const a = await admin();
    const s = await login({ login: a.user.phone, password: PASSWORD });
    const token = s.body.data.accessToken as string;
    const change = (body: object) => request(app).post('/api/v1/admin/me/password').set(bearer(token)).send(body);

    expect((await change({ newPassword: 'Yangi-parol-2027' })).body.error.code).toBe('PASSWORD_INCORRECT');
    const weak = await change({ currentPassword: PASSWORD, newPassword: 'qisqa1' });
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');
    expect((await change({ currentPassword: PASSWORD, newPassword: 'faqatharflardaniborat' })).body.error.code).toBe('WEAK_PASSWORD');
    expect((await change({ currentPassword: PASSWORD, newPassword: `Parol${a.user.phone!.slice(4)}x` })).body.error.code).toBe('WEAK_PASSWORD');

    expect((await change({ currentPassword: PASSWORD, newPassword: 'Yangi-parol-2027' })).status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: a.user.id, revokedAt: null } })).toBe(0);
    expect((await login({ login: a.user.phone, password: PASSWORD })).status).toBe(401);
    expect((await login({ login: a.user.phone, password: 'Yangi-parol-2027' })).status).toBe(200);
  });

  it("parol hash'i hech qaysi javobda chiqmaydi", async () => {
    const a = await admin();
    const responses = await Promise.all([
      request(app).get('/api/v1/users/me').set(bearer(a.token)),
      request(app).get('/api/v1/admin/users').set(bearer(a.token)),
      request(app).get(`/api/v1/admin/users/${a.user.id}`).set(bearer(a.token)),
      request(app).get(`/api/v1/users/${a.user.id}/public`),
      request(app).get('/api/v1/admin/export/users').set(bearer(a.token)),
    ]);
    for (const r of responses) {
      const text = r.text;
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('scrypt$');
    }
    expect(responses[2].body.data.user.hasPassword).toBe(true);
  });
});

describe("Admin ma'lumotlar bazasi", () => {
  beforeEach(resetDb);

  it("foydalanuvchi kartasini ko'rish va CSV eksport jurnalga yoziladi; eksport faqat admin uchun", async () => {
    const a = await admin();
    const u = await createUser({ firstName: 'Dilnoza' });
    expect((await request(app).get(`/api/v1/admin/users/${u.user.id}`).set(bearer(a.token))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'user.view', targetId: u.user.id } })).toBe(1);

    const csv = await request(app).get('/api/v1/admin/export/users').set(bearer(a.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="abutax-users-/);
    expect(csv.text).toContain('Dilnoza');
    expect(await prisma.auditLog.count({ where: { action: 'export.csv', targetId: 'users' } })).toBe(1);
    expect((await request(app).get('/api/v1/admin/export/users').set(bearer(u.token))).status).toBe(403);
  });

  it('CSV formula injeksiyasi: = + - @ bilan boshlangan matn Excel formulasi sifatida ishlamaydi', async () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+998901234567')).toBe("'+998901234567");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('oddiy, matn')).toBe('"oddiy, matn"');

    const a = await admin();
    const c = await createCities();
    const p = await createUser();
    await request(app).post('/api/v1/ride-requests').set(bearer(p.token)).send({
      fromCityId: c.andijon.id,
      toCityId: c.toshkent.id,
      date: new Date(Date.now() + 5 * 3600_000 + 86_400_000).toISOString().slice(0, 10),
      seats: 1,
      note: '=cmd|/c calc!A1',
    });
    const csv = await request(app).get('/api/v1/admin/export/ride-requests').set(bearer(a.token));
    expect(csv.text).toContain("'=cmd|/c calc!A1");
    expect(csv.text).not.toMatch(/,=cmd/);
  });

  it("sharhni o'chirish reytingni qayta hisoblaydi va jurnalga yoziladi", async () => {
    const a = await admin();
    const driver = await createUser({ role: 'DRIVER' });
    await prisma.driverProfile.create({ data: { userId: driver.user.id, status: 'APPROVED', ratingAvg: 1, ratingCount: 1 } });
    const author = await createUser();
    const review = await prisma.review.create({ data: { authorId: author.user.id, targetUserId: driver.user.id, rating: 1, text: 'haqorat', targetRole: 'DRIVER' } });
    expect((await request(app).delete(`/api/v1/admin/reviews/${review.id}`).set(bearer(a.token))).status).toBe(200);
    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: driver.user.id } });
    expect([Number(profile.ratingAvg), profile.ratingCount]).toEqual([0, 0]);
    expect(await prisma.auditLog.count({ where: { action: 'review.delete', targetId: review.id } })).toBe(1);
  });
});

describe("Safar so'rovlari orqali haydovchilarni spam qilish", () => {
  beforeEach(resetDb);

  it("kuniga 5 tadan ortiq so'rov yaratib bo'lmaydi (yaratib-bekor qilish bilan ham)", async () => {
    const c = await createCities();
    const p = await createUser();
    const body = { fromCityId: c.andijon.id, toCityId: c.toshkent.id, date: new Date(Date.now() + 5 * 3600_000 + 86_400_000).toISOString().slice(0, 10), seats: 1 };
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/v1/ride-requests').set(bearer(p.token)).send(body);
      expect(r.status).toBe(201);
      await request(app).post(`/api/v1/ride-requests/${r.body.data.id}/cancel`).set(bearer(p.token));
    }
    const sixth = await request(app).post('/api/v1/ride-requests').set(bearer(p.token)).send(body);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RIDE_REQUEST_DAILY_LIMIT');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  });
});
