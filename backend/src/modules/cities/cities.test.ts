import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { resetDb } from '../../test/db.js';

const app = createApp();

describe('GET /api/v1/cities', () => {
  beforeEach(resetDb);

  it("shaharlar ro'yxatini standart formatda qaytaradi", async () => {
    await prisma.city.createMany({
      data: [
        { nameUz: 'Andijon', nameRu: 'Андижан', region: 'Andijon viloyati' },
        { nameUz: 'Toshkent', nameRu: 'Ташкент', region: 'Toshkent shahri' },
      ],
    });

    const res = await request(app).get('/api/v1/cities');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      nameUz: 'Andijon',
      nameRu: 'Андижан',
      region: 'Andijon viloyati',
    });
  });
});
