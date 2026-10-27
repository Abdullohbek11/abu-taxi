import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { resetDb } from '../test/db.js';
import { bearer, createUser, loginViaBot } from '../test/helpers.js';
import { grantAdmin, revokeAdmin } from './admin.js';

const app = createApp();

describe('admin CLI', () => {
  beforeEach(resetDb);

  it("yangi raqamga admin beriladi; admin botga raqamini yuborganda Telegram bog'lanadi va admin panelga kiradi", async () => {
    const admin = await grantAdmin('90 123 45 67');
    expect(admin).toMatchObject({ phone: '+998901234567', role: 'ADMIN', telegramId: null });

    const { res, accessToken } = await loginViaBot(app, '42', '+998901234567');
    expect(res.body.data.user).toMatchObject({ id: admin.id, role: 'ADMIN', telegramId: '42' });
    expect((await request(app).get('/api/v1/admin/stats').set(bearer(accessToken))).status).toBe(200);
  });

  it('mavjud foydalanuvchini admin qiladi; oxirgi adminni olib tashlab bo\'lmaydi', async () => {
    const { user } = await createUser({ phone: '+998935551122', role: 'PASSENGER' });
    await grantAdmin('+998935551122');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('ADMIN');

    await expect(revokeAdmin('+998935551122')).rejects.toThrow('Oxirgi admin');
    await grantAdmin('+998935551133');
    await revokeAdmin('+998935551122');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBeNull();
  });

  it("noto'g'ri raqam rad etiladi", async () => {
    await expect(grantAdmin('12345')).rejects.toThrow();
  });
});
