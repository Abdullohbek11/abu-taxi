import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';
import { bearer, createUser } from '../../test/helpers.js';

const app = createApp();

describe('users', () => {
  beforeEach(resetDb);

  it('tokensiz — 401', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it("noto'g'ri token — 401 TOKEN_INVALID", async () => {
    const res = await request(app).get('/api/v1/users/me').set(bearer('abc.def.ghi'));
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('GET/PATCH /users/me', async () => {
    const { token } = await createUser({ role: null });
    const me = await request(app).get('/api/v1/users/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBeNull();

    const upd = await request(app)
      .patch('/api/v1/users/me')
      .set(bearer(token))
      .send({ firstName: "  Oʻktam  ", lang: 'RU' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ firstName: 'Oʻktam', lang: 'RU' });

    const bad = await request(app).patch('/api/v1/users/me').set(bearer(token)).send({ role: 'ADMIN' });
    expect(bad.status).toBe(400); // strict: noma'lum maydon

    // telegramUsername qo'lda o'rnatilmaydi (boshqa odam nomidan kontakt ko'rsatish mumkin edi)
    const tg = await request(app).patch('/api/v1/users/me').set(bearer(token)).send({ telegramUsername: 'durov' });
    expect(tg.status).toBe(400);

    // Ismda havola/raqam — rad etiladi
    const scam = await request(app).patch('/api/v1/users/me').set(bearer(token)).send({ firstName: 't.me/scam123' });
    expect(scam.status).toBe(400);
  });

  it('rol tanlash va ADMIN tanlab bo\'lmasligi', async () => {
    const { token } = await createUser({ role: null });
    const res = await request(app).patch('/api/v1/users/me/role').set(bearer(token)).send({ role: 'DRIVER' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('DRIVER');
    expect(res.body.data.accessToken).toBeTypeOf('string');

    const admin = await request(app).patch('/api/v1/users/me/role').set(bearer(token)).send({ role: 'ADMIN' });
    expect(admin.status).toBe(400);
  });

  it('bloklangan foydalanuvchi o\'qiy oladi, lekin o\'zgartira olmaydi', async () => {
    const { token } = await createUser({ isBlocked: true });
    expect((await request(app).get('/api/v1/users/me').set(bearer(token))).status).toBe(200);
    const res = await request(app).patch('/api/v1/users/me').set(bearer(token)).send({ firstName: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('USER_BLOCKED');
  });

  it("ommaviy profil: telefon yo'q, familiya qisqartirilgan", async () => {
    const { user } = await createUser({ firstName: 'Bahodir', lastName: 'Aliyev', role: 'DRIVER' });
    await prisma.driverProfile.create({
      data: {
        userId: user.id,
        status: 'APPROVED',
        ratingAvg: 4.9,
        ratingCount: 10,
        vehicles: { create: { model: 'Cobalt', color: 'Oq', plateNumber: '01 A 777 BA', seats: 4, status: 'APPROVED' } },
      },
    });

    const res = await request(app).get(`/api/v1/users/${user.id}/public`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Bahodir A.',
      rating: { avg: 4.9, count: 10 },
      driver: { vehicles: [{ plateNumber: '01 A 7**' }] },
    });
    expect(JSON.stringify(res.body)).not.toContain(user.phone!);
  });
});
