import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resolveLocale } from './lib/i18n.js';
import { maskPhone } from './lib/logger.js';

const app = createApp();

describe('ilova asoslari', () => {
  it('/health ishlaydi', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it("noma'lum manzil — o'zbekcha xato formati", async () => {
    const res = await request(app).get('/api/v1/yoq');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: "So'ralgan manzil mavjud emas" },
    });
  });

  it('Accept-Language: ru — ruscha xabar', async () => {
    const res = await request(app).get('/api/v1/yoq').set('Accept-Language', 'ru-RU,ru;q=0.9');
    expect(res.body.error.message).toBe('Маршрут не найден');
  });

  it("noto'g'ri JSON — VALIDATION_ERROR", async () => {
    const res = await request(app).post('/api/v1/cities').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('xavfsizlik sarlavhalari va CORS', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await request(app).get('/health').set('Origin', 'http://evil.com');
    expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.com');
  });
});

describe('yordamchilar', () => {
  it('resolveLocale', () => {
    expect(resolveLocale(undefined)).toBe('uz');
    expect(resolveLocale('ru')).toBe('ru');
    expect(resolveLocale('en-US,ru;q=0.5')).toBe('ru');
    expect(resolveLocale('uz-UZ,ru;q=0.8')).toBe('uz');
    expect(resolveLocale('en')).toBe('uz');
  });

  it('maskPhone', () => {
    expect(maskPhone('+998901234567')).toBe('+99890***4567');
  });
});
