/**
 * InnoDB deadlock regressiyasi: o'chirilgan (delete-marked) unique kalitlarga parallel INSERT
 * deadlock beradi. Bu holat oldin test to'plamini beqaror qilgan va production'da 500 qaytarardi.
 */
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { citiesService } from '../modules/cities/cities.service.js';
import { resetDb } from '../test/db.js';
import { isDeadlock, prisma, withDeadlockRetry } from './prisma.js';
import { hit } from './rateLimit.js';

const deadlock = () =>
  new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock. Please retry your transaction', {
    code: 'P2034',
    clientVersion: Prisma.prismaVersion.client,
  });

describe('deadlock: aniqlash va qayta urinish', () => {
  afterEach(() => vi.restoreAllMocks());

  it('P2034 va MySQL 1213 xabarlari deadlock deb aniqlanadi, boshqalari — yo\'q', () => {
    expect(isDeadlock(deadlock())).toBe(true);
    expect(isDeadlock(new Error('Deadlock found when trying to get lock; try restarting transaction'))).toBe(true);
    expect(isDeadlock(new Error('Unique constraint failed'))).toBe(false);
  });

  it('deadlock — qayta bajariladi; boshqa xato — darhol tashlanadi', async () => {
    let calls = 0;
    const ok = await withDeadlockRetry(async () => {
      calls++;
      if (calls < 3) throw deadlock();
      return 'ok';
    });
    expect(ok).toBe('ok');
    expect(calls).toBe(3);

    let other = 0;
    await expect(
      withDeadlockRetry(async () => {
        other++;
        throw new Error('boshqa xato');
      }),
    ).rejects.toThrow('boshqa xato');
    expect(other).toBe(1);
  });

  it('urinishlar tugasa xato tashlanadi (cheksiz aylanmaydi)', async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw deadlock();
      }, 3),
    ).rejects.toThrow();
    expect(calls).toBe(3);
  });

  it("qolgan deadlock foydalanuvchiga 500 emas, 503 TRY_AGAIN + Retry-After bo'lib qaytadi", async () => {
    vi.spyOn(citiesService, 'list').mockRejectedValue(deadlock());
    const res = await request(createApp()).get('/api/v1/cities');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('TRY_AGAIN');
    expect(res.headers['retry-after']).toBe('1');
  });
});

describe("deadlock: haqiqiy MySQL ssenariysi (o'chirilgan unique kalitga parallel yozish)", () => {
  beforeEach(resetDb);

  it("asl xato: o'chirilgan shaharlarni parallel qayta yaratish — retry bilan 10 raundda ham xatosiz", async () => {
    const rows = [
      { nameUz: 'Andijon', nameRu: 'Андижан', region: 'Andijon viloyati' },
      { nameUz: 'Asaka', nameRu: 'Асака', region: 'Andijon viloyati' },
      { nameUz: 'Shahrixon', nameRu: 'Шахрихан', region: 'Andijon viloyati' },
      { nameUz: 'Toshkent', nameRu: 'Ташкент', region: 'Toshkent shahri' },
    ];
    for (let round = 0; round < 10; round++) {
      await prisma.city.deleteMany();
      await Promise.all(rows.map((data) => withDeadlockRetry(() => prisma.city.create({ data }))));
      expect(await prisma.city.count()).toBe(rows.length);
    }
  });

  it("rate limit: tozalangan kalitga 30 ta parallel so'rov — xatosiz va aniq hisob", async () => {
    for (let round = 0; round < 5; round++) {
      await prisma.rateLimit.deleteMany();
      const results = await Promise.all(Array.from({ length: 30 }, () => hit('test:parallel', 20, 60)));
      // Hisob yozilgandan keyin o'qiladi: parallel holatda limit qattiqroq bo'lishi mumkin, lekin hech qachon oshib ketmaydi
      const allowed = results.filter(Boolean).length;
      expect(allowed).toBeGreaterThan(0);
      expect(allowed).toBeLessThanOrEqual(20);
      expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key: 'test:parallel' } })).count).toBe(30);
    }
  });
});
