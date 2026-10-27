import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetCounter } from '../../lib/rateLimit.js';
import { resetDb } from '../../test/db.js';
import { bearer, botHeaders, botLoginCode, createUser, loginViaBot } from '../../test/helpers.js';
import { CODE_ALPHABET, hashLoginCode } from './loginCode.service.js';

const app = createApp();
const PHONE = '+998901234567';
const TG = '700100200';

const useCode = (code: string, headers: Record<string, string> = {}) =>
  request(app).post('/api/v1/auth/code').set(headers).send({ code });

describe("bot ichki API: himoya", () => {
  beforeEach(resetDb);

  it("X-Bot-Secret bo'lmasa yoki noto'g'ri bo'lsa — 401", async () => {
    const none = await request(app).post('/api/v1/internal/bot/login-code').send({ telegramId: TG, phone: PHONE });
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('BOT_UNAUTHORIZED');
    const wrong = await request(app)
      .post('/api/v1/internal/bot/login-code')
      .set('X-Bot-Secret', 'x'.repeat(42))
      .send({ telegramId: TG, phone: PHONE });
    expect(wrong.status).toBe(401);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("ro'yxatdan o'tish va kirish (Telegram bot kodi)", () => {
  beforeEach(resetDb);

  it("yangi foydalanuvchi: kontakt → hisob yaratiladi → kod → saytga kirish (isNew)", async () => {
    const r = await botLoginCode(app, {
      telegramId: TG, phone: PHONE, firstName: 'Ali', lastName: 'Valiyev', username: 'ali_uz', languageCode: 'ru',
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ expiresIn: 60, isNew: true, lang: 'RU' });
    expect(r.body.data.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));

    // Bazada kodning o'zi emas, faqat hash saqlanadi
    const stored = await prisma.loginCode.findFirstOrThrow();
    expect(stored.codeHash).toBe(hashLoginCode(r.body.data.code));
    expect(stored.codeHash).not.toContain(r.body.data.code);

    const login = await useCode(r.body.data.code);
    expect(login.status).toBe(200);
    expect(login.body.data).toMatchObject({
      isNew: true,
      user: { phone: PHONE, telegramId: TG, telegramUsername: 'ali_uz', firstName: 'Ali', lastName: 'Valiyev', role: null, lang: 'RU' },
    });
    expect(login.body.data.refreshToken).toBeUndefined();
    expect((login.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/refresh_token=.+HttpOnly/i);
  });

  it("raqam yuborilmagan noma'lum Telegram — PHONE_REQUIRED; keyin raqamsiz ham kod beriladi", async () => {
    const first = await botLoginCode(app, { telegramId: TG });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('PHONE_REQUIRED');

    await botLoginCode(app, { telegramId: TG, phone: PHONE });
    const again = await botLoginCode(app, { telegramId: TG, username: 'yangi_nom' });
    expect(again.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: TG } })).telegramUsername).toBe('yangi_nom');
  });

  it("rol tanlangan foydalanuvchi uchun isNew=false", async () => {
    await createUser({ phone: PHONE, telegramId: TG, role: 'PASSENGER' });
    const { res } = await loginViaBot(app, TG, PHONE);
    expect(res.body.data.isNew).toBe(false);
  });

  it("raqami bor, lekin Telegram'i bog'lanmagan hisob — bog'lanadi (yangi hisob ochilmaydi)", async () => {
    const { user } = await createUser({ phone: PHONE, telegramId: null, role: 'DRIVER', firstName: 'Bahodir', lastName: 'Aliyev' });
    const { res } = await loginViaBot(app, TG, PHONE);
    expect(res.body.data.user).toMatchObject({ id: user.id, telegramId: TG, firstName: 'Bahodir', role: 'DRIVER' });
    expect(await prisma.user.count()).toBe(1);
  });

  it("raqam BOSHQA Telegram akkauntga bog'langan — PHONE_TAKEN (raqam qayta sotilgan bo'lishi mumkin)", async () => {
    await createUser({ phone: PHONE, telegramId: '111' });
    const r = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PHONE_TAKEN');
  });

  it("Telegram'dagi raqam o'zgarsa yangilanadi; boshqa hisobning raqamiga o'tib bo'lmaydi", async () => {
    await botLoginCode(app, { telegramId: TG, phone: PHONE });
    await botLoginCode(app, { telegramId: TG, phone: '+998935550000' });
    expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: TG } })).phone).toBe('+998935550000');

    await createUser({ phone: '+998970001122' });
    const taken = await botLoginCode(app, { telegramId: TG, phone: '+998970001122' });
    expect(taken.body.error.code).toBe('PHONE_TAKEN');
  });

  it("Telegram ismidagi emoji/havola qabul qilinmaydi (ism bo'sh qoladi)", async () => {
    await botLoginCode(app, { telegramId: TG, phone: PHONE, firstName: '🔥 t.me/scam', lastName: 'Valiyev' });
    const u = await prisma.user.findUniqueOrThrow({ where: { telegramId: TG } });
    expect(u.firstName).toBeNull();
    expect(u.lastName).toBe('Valiyev');
  });

  it('bloklangan foydalanuvchiga kod berilmaydi', async () => {
    await createUser({ phone: PHONE, telegramId: TG, isBlocked: true });
    const r = await botLoginCode(app, { telegramId: TG });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('USER_BLOCKED');
  });

  it('bir vaqtda ikki so\'rov — bitta hisob', async () => {
    const [a, b] = await Promise.all([botLoginCode(app, { telegramId: TG, phone: PHONE }), botLoginCode(app, { telegramId: TG, phone: PHONE })]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe('kod xavfsizligi', () => {
  beforeEach(resetDb);

  it("kod bir martalik: 5 ta parallel kirishdan faqat bittasi o'tadi", async () => {
    const { body } = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    const results = await Promise.all(Array.from({ length: 5 }, () => useCode(body.data.code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === 'LOGIN_CODE_INVALID')).toHaveLength(4);
  });

  it("yangi kod eskisini bekor qiladi", async () => {
    const first = (await botLoginCode(app, { telegramId: TG, phone: PHONE })).body.data.code;
    const second = (await botLoginCode(app, { telegramId: TG })).body.data.code;
    expect((await useCode(first)).body.error.code).toBe('LOGIN_CODE_INVALID');
    expect((await useCode(second)).status).toBe(200);
  });

  it("muddati o'tgan kod (60 soniya) qabul qilinmaydi", async () => {
    const { body } = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    await prisma.loginCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await useCode(body.data.code)).body.error.code).toBe('LOGIN_CODE_INVALID');
  });

  it("kichik harf va bo'shliqlar bilan kiritilgan kod qabul qilinadi; noto'g'ri format — 400", async () => {
    const { body } = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    const code: string = body.data.code;
    const typed = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
    expect((await useCode(typed)).status).toBe(200);

    for (const bad of ['12345', 'ABCDEFG', 'ABCDE0', 'ABCDEI']) expect((await useCode(bad)).status).toBe(400);
  });

  it("bloklangan foydalanuvchi kod bilan ham kira olmaydi", async () => {
    const { body } = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    await prisma.user.updateMany({ data: { isBlocked: true } });
    const res = await useCode(body.data.code);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('USER_BLOCKED');
  });

  it('bitta Telegram foydalanuvchiga 10 daqiqada 5 tadan ortiq kod berilmaydi (Retry-After bilan)', async () => {
    for (let i = 0; i < 5; i++) expect((await botLoginCode(app, { telegramId: TG, phone: PHONE })).status).toBe(200);
    const sixth = await botLoginCode(app, { telegramId: TG });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('LOGIN_CODE_LIMIT');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  });

  it("bitta IP dan 10 daqiqada 10 tadan ortiq urinish — 429 (to'g'ri kod ham)", async () => {
    for (let i = 0; i < 10; i++) await useCode('AAAAAA');
    const { body } = await botLoginCode(app, { telegramId: TG, phone: PHONE });
    const res = await useCode(body.data.code);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('LOGIN_ATTEMPTS_LIMIT');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it("tizim bo'yicha daqiqasiga 100 tadan ortiq noto'g'ri urinish — vaqtincha to'xtatiladi (taqsimlangan brute-force)", async () => {
    await prisma.rateLimit.create({ data: { key: 'logincode:fail:global', count: 100, expiresAt: new Date(Date.now() + 60_000) } });
    const res = await useCode('AAAAAA');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('TRY_AGAIN');
  });
});

describe('Refresh token', () => {
  beforeEach(resetDb);

  const login = async (tg = TG, phone = PHONE) => loginViaBot(app, tg, phone);

  it("rotatsiya: yangi token beriladi, eskisi bekor bo'ladi", async () => {
    const { cookie } = await login();
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(200);
    const cookie2 = (r1.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0]!;
    expect(cookie2).not.toBe(cookie);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie2)).status).toBe(200);
  });

  it("bir vaqtda ikki tab yangilasa: ikkinchisi 409, cookie o'chirilmaydi, sessiya saqlanadi", async () => {
    const { cookie } = await login();
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);
    const loser = a.status === 200 ? b : a;
    const winner = a.status === 200 ? a : b;
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe('REFRESH_IN_PROGRESS');
    expect(((loser.headers['set-cookie'] as unknown as string[] | undefined) ?? []).some((c) => c.startsWith('refresh_token=;'))).toBe(false);
    // Muhlat ichida eski token yana kelsa ham sessiyalar yopilmaydi
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie)).body.error.code).toBe('REFRESH_IN_PROGRESS');
    const fresh = (winner.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0]!;
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', fresh)).status).toBe(200);
  });

  it('eski token qayta ishlatilsa (muhlatdan keyin) — barcha sessiyalar bekor qilinadi', async () => {
    const a = await login();
    await resetCounter(`logincode:issue:10m:${TG}`);
    const b = await login();
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', a.cookie).expect(200);
    const fresh = (r1.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0]!;
    await prisma.refreshToken.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });

    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', a.cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', fresh)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', b.cookie)).status).toBe(401);
  });

  it("mobil klient: refresh token body orqali (Origin'siz, cookie'siz)", async () => {
    const { res } = await loginViaBot(app, TG, PHONE, { headers: { 'X-Client': 'mobile' } });
    const rt = res.body.data.refreshToken as string;
    expect(rt).toBeTypeOf('string');
    const r = await request(app).post('/api/v1/auth/refresh').set('X-Client', 'mobile').send({ refreshToken: rt });
    expect(r.status).toBe(200);
    expect(r.body.data.refreshToken).not.toBe(rt);
  });

  it('logout va logout-all', async () => {
    const a = await login();
    await request(app).post('/api/v1/auth/logout').set('Cookie', a.cookie).expect(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', a.cookie)).status).toBe(401);

    const b = await login();
    await request(app).post('/api/v1/auth/logout-all').set(bearer(b.accessToken)).expect(200);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});

describe('bildirishnomalar navbati (bot uchun outbox)', () => {
  beforeEach(resetDb);

  it("faqat Telegram'i bor, bloklanmagan va 1 soatdan yangi xabarlar; ack'dan keyin qaytmaydi", async () => {
    const tg = await createUser({ telegramId: '501', lang: 'RU' });
    const noTg = await createUser({ telegramId: null });
    const blocked = await createUser({ telegramId: '502', isBlocked: true });
    const fresh = await prisma.notification.create({ data: { userId: tg.user.id, type: 'booking:new', payload: { seats: 2 } } });
    await prisma.notification.create({ data: { userId: tg.user.id, type: 'booking:new', payload: {}, createdAt: new Date(Date.now() - 2 * 3600_000) } });
    await prisma.notification.create({ data: { userId: noTg.user.id, type: 'booking:new', payload: {} } });
    await prisma.notification.create({ data: { userId: blocked.user.id, type: 'booking:new', payload: {} } });

    const pending = await request(app).get('/api/v1/internal/bot/notifications').set(botHeaders());
    expect(pending.body.data).toEqual([{ id: fresh.id, telegramId: '501', lang: 'RU', type: 'booking:new', payload: { seats: 2 } }]);

    await request(app).post('/api/v1/internal/bot/notifications/ack').set(botHeaders()).send({ ids: [fresh.id] }).expect(200);
    expect((await request(app).get('/api/v1/internal/bot/notifications').set(botHeaders())).body.data).toEqual([]);
  });

  it("ichki API kalitsiz — 401", async () => {
    expect((await request(app).get('/api/v1/internal/bot/notifications')).status).toBe(401);
  });
});

describe("bot ma'lumotlaridagi chekka holatlar kirishni to'xtatmaydi", () => {
  beforeEach(resetDb);

  it("g'ayrioddiy username saqlanmaydi, lekin kod beriladi", async () => {
    const r = await botLoginCode(app, { telegramId: TG, phone: PHONE, username: 'ab' });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { telegramId: TG } })).telegramUsername).toBeNull();
  });
});
