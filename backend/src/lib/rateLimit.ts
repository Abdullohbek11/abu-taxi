import { isIP } from 'node:net';
import { prisma, withDeadlockRetry } from './prisma.js';

/**
 * Qat'iy oynali hisoblagich (fixed window), MySQL `RateLimit` jadvalida.
 * Bitta atomik `INSERT ... ON DUPLICATE KEY UPDATE`: oyna tugagan bo'lsa hisob 1 dan boshlanadi.
 * MySQL qiymatlarni chapdan o'ngga yangilaydi — `count` eski `expiresAt` bilan solishtiriladi,
 * keyin `expiresAt` yangilanadi (u ham o'zining eski qiymatini ko'radi).
 * Vaqtlar ilovadan uzatiladi (server vaqt zonasiga bog'liq emas).
 */
export async function hitWithTtl(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = new Date();
  const expires = new Date(now.getTime() + windowSec * 1000);
  // Bitta atomik so'rov — deadlock'da (masalan, cron tozalagan kalitga parallel so'rovlar) xavfsiz qayta bajariladi
  await withDeadlockRetry(
    () => prisma.$executeRaw`
      INSERT INTO RateLimit (\`key\`, \`count\`, expiresAt) VALUES (${key}, 1, ${expires})
      ON DUPLICATE KEY UPDATE
        \`count\` = IF(expiresAt <= ${now}, 1, \`count\` + 1),
        expiresAt = IF(expiresAt <= ${now}, ${expires}, expiresAt)`,
  );
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  const count = row?.count ?? 1;
  const retryAfter = row ? Math.max(Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000), 1) : windowSec;
  return { allowed: count <= limit, retryAfter };
}

export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  return (await hitWithTtl(key, limit, windowSec)).allowed;
}

/** Faqat hisoblagich qiymatini o'qiydi (oshirmaydi); muddati o'tgan — 0. */
export async function peek(key: string): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  return row && row.expiresAt > new Date() ? row.count : 0;
}

export async function resetCounter(...keys: string[]): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
}

/** Muddati o'tgan hisoblagichlarni o'chiradi (cron). */
export async function purgeExpiredCounters(now = new Date()): Promise<number> {
  return (await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } })).count;
}

/**
 * Limit kaliti uchun IP. IPv6 foydalanuvchiga odatda butun /64 tarmoq beriladi —
 * alohida manzillar bo'yicha sanash limitni aylanib o'tishga imkon beradi, shuning uchun /64 prefiks olinadi.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const v4mapped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4mapped) === 6) {
    const [head = '', tail = ''] = v4mapped.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const full = [...headParts, ...Array(8 - headParts.length - tailParts.length).fill('0'), ...tailParts];
    return `${full.slice(0, 4).map((p) => p.padStart(4, '0')).join(':')}::/64`;
  }
  return v4mapped;
}
