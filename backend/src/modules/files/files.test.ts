import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { storage, verifyPrivateLink } from '../../lib/storage.js';

const app = createApp();

describe('lokal fayl saqlash (STORAGE_DRIVER=local)', () => {
  it('public fayl /uploads orqali ochiq, uzoq keshlanadi', async () => {
    await storage.init();
    const url = await storage.putPublic('test/a.webp', Buffer.from('rasm'), 'image/webp');
    expect(url).toBe('/uploads/test/a.webp');
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    await storage.deletePublicUrl(url);
    expect((await request(app).get(url)).status).toBe(404);
  });

  it('private fayl faqat imzolangan va muddati o\'tmagan havola bilan', async () => {
    const key = await storage.putPrivate('drivers/x/doc.webp', Buffer.from('hujjat'), 'image/webp');
    const link = await storage.signedUrl(key);
    expect(link).toMatch(/^\/files\/private\/drivers\/x\/doc\.webp\?exp=\d+&sig=/);

    const ok = await request(app).get(link);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');

    // Imzosiz, soxta imzo, boshqa faylga imzoni ko'chirish — 403
    expect((await request(app).get(`/files/private/${key}`)).status).toBe(403);
    expect((await request(app).get(link.replace(/sig=[^&]+/, 'sig=AAAA'))).status).toBe(403);
    expect((await request(app).get(link.replace('doc.webp', 'other.webp'))).status).toBe(403);
    // Private papka /uploads orqali ochiq emas
    const traversal = await request(app).get(`/uploads/../private/${key}`);
    expect([403, 404]).toContain(traversal.status);
    expect(traversal.text).not.toContain('hujjat');
    await storage.deletePrivate(key);
  });

  it("muddati o'tgan havola rad etiladi; ../ yo'llari rad etiladi", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(verifyPrivateLink('a.webp', String(past), 'x')).toBe(false);
    const res = await request(app).get('/files/private/..%2F..%2F.env?exp=9999999999&sig=x');
    expect([403, 404]).toContain(res.status);
  });
});
