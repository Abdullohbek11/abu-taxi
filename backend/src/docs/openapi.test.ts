import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const app = createApp();

describe('OpenAPI', () => {
  it("/docs.json barcha asosiy yo'llarni o'z ichiga oladi", async () => {
    const res = await request(app).get('/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    const paths = Object.keys(res.body.paths);
    expect(paths.length).toBeGreaterThanOrEqual(55);
    for (const p of ['/auth/code', '/internal/bot/login-code', '/trips', '/bookings', '/cargo/{id}/offers', '/admin/stats']) expect(paths).toContain(p);
    // zod sxemasidan kelgan maydonlar
    const body = res.body.paths['/bookings'].post.requestBody.content['application/json'].schema;
    expect(body.properties.seats).toMatchObject({ type: 'integer', minimum: 1, maximum: 8 });
  });

  it('/docs Swagger UI sahifasi', async () => {
    const res = await request(app).get('/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
