import http, { type RequestListener, type Server } from 'node:http';
import { config } from 'dotenv';
import { afterAll } from 'vitest';

// env.ts import qilinishidan oldin test muhitini yuklash
config({ path: '.env.test', override: true });

/**
 * Beqaror "timeout"ning sababi va yechimi.
 *
 * Supertest `request(app)` har chaqiruvda `http.createServer(app).listen(0)` qiladi: server `::` (dual-stack)
 * da yangi portda ochiladi, klient esa `127.0.0.1` ga ulanadi va so'rovdan keyin server yopiladi.
 * Bitta to'liq yugurishda ~1500 marta shunday bo'lib, juda kamdan-kam ulanish server tomonidan qabul
 * qilinmay osilib qolardi (bazada faoliyat yo'q, faqat klient socketi qolardi) — to'plam tasodifan yiqilardi.
 *
 * Yechim: test fayli boshida 127.0.0.1 da oldindan tinglayotgan serverlar ochiladi; supertest chaqirgan
 * `http.createServer(app)` shu serverlardan birini app'ga biriktirib qaytaradi. Server allaqachon tinglayotgani
 * uchun supertest uni o'ziniki deb hisoblamaydi, yangi port ochmaydi va yopmaydi.
 *
 * Eslatma: `listen(0, '127.0.0.1')` Node 24 da manzilni sinxron bermaydi — shuning uchun oldindan ochiladi.
 * `node:http` barcha modul tizimlari uchun yagona obyekt (vi.mock CJS supertest nusxasiga ta'sir qilmaydi).
 */
const POOL_SIZE = 16;

interface Slot {
  server: Server;
  handler: RequestListener | null;
}

const originalCreateServer = http.createServer;
const slots: Slot[] = await Promise.all(
  Array.from({ length: POOL_SIZE }, async () => {
    const slot: Slot = { server: null as unknown as Server, handler: null };
    slot.server = originalCreateServer((req, res) => slot.handler?.(req, res));
    await new Promise<void>((resolve) => slot.server.listen(0, '127.0.0.1', resolve));
    return slot;
  }),
);
const assigned = new Map<RequestListener, Slot>();

function calledFromSupertest(): boolean {
  return /[\\/]node_modules[\\/]supertest[\\/]/.test(new Error().stack ?? '');
}

(http as { createServer: typeof http.createServer }).createServer = function (this: unknown, ...args: unknown[]) {
  const [handler] = args;
  if (args.length === 1 && typeof handler === 'function' && calledFromSupertest()) {
    const app = handler as RequestListener;
    let slot = assigned.get(app);
    if (!slot) {
      slot = slots.find((s) => s.handler === null);
      if (slot) {
        slot.handler = app;
        assigned.set(app, slot);
      }
    }
    if (slot) return slot.server;
    // Hovuz tugasa (bitta faylda 16 dan ortiq alohida app) — supertest'ning odatiy xatti-harakati
  }
  return (originalCreateServer as (...a: unknown[]) => Server).apply(this, args);
} as typeof http.createServer;

afterAll(async () => {
  (http as { createServer: typeof http.createServer }).createServer = originalCreateServer;
  await Promise.all(slots.map((s) => new Promise((r) => s.server.close(r))));
  assigned.clear();
});
