import { createHmac, randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { clientKey, hitWithTtl, peek } from '../../lib/rateLimit.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Telegram bot orqali kirish kodi (42.uz uslubi): foydalanuvchi botdan kod oladi va saytga kiritadi.
 *
 * Saytda telefon so'ralmaydi — kodning o'zi foydalanuvchini aniqlaydi. Shuning uchun kod faqat
 * raqamlardan emas (10^6 — taxmin qilishga zaif), chalkash belgilarsiz 32 belgili alifbodan olinadi:
 * 6 belgi = 32^6 ≈ 1,07 mlrd variant. Qo'shimcha himoya: 60 soniya, bir martalik, IP va umumiy limitlar.
 */
export const LOGIN_CODE_TTL_SEC = 60;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // I, O, 0, 1 yo'q
export const CODE_LENGTH = 6;

/** Bitta IP dan kod tekshirish urinishlari */
const VERIFY_PER_IP = { limit: 10, windowSec: 600 };
/** Butun tizim bo'yicha noto'g'ri urinishlar (taqsimlangan brute-force'ga qarshi) */
const GLOBAL_FAILS_PER_MIN = 100;
/** Bitta Telegram foydalanuvchiga kod berish */
const ISSUE_LIMITS = [
  { window: '10m', limit: 5, sec: 600 },
  { window: 'day', limit: 30, sec: 86_400 },
] as const;

const codeKey = createHmac('sha256', env.JWT_ACCESS_SECRET).update('abutax:login-code:v1').digest();

export function hashLoginCode(code: string): string {
  return createHmac('sha256', codeKey).update(code).digest('hex');
}

/** Foydalanuvchi kiritgan kodni normallashtiradi: bo'shliq/chiziqcha olib tashlanadi, katta harf. */
export function normalizeLoginCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const loginCodeService = {
  /**
   * Foydalanuvchiga yangi kod beradi. Oldingi ishlatilmagan kodlari bekor qilinadi
   * (bir vaqtda faqat bitta faol kod).
   */
  async issue(userId: string, telegramId: string): Promise<{ code: string; expiresIn: number }> {
    for (const l of ISSUE_LIMITS) {
      const { allowed, retryAfter } = await hitWithTtl(`logincode:issue:${l.window}:${telegramId}`, l.limit, l.sec);
      if (!allowed) throw new AppError('LOGIN_CODE_LIMIT', undefined, { retryAfter });
    }

    await prisma.loginCode.deleteMany({ where: { userId, usedAt: null } });
    const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_SEC * 1000);
    // Faol kodlar orasida to'qnashuv ehtimoli juda kichik; bo'lsa — yangisini olamiz
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        await prisma.loginCode.create({ data: { userId, codeHash: hashLoginCode(code), expiresAt } });
        return { code, expiresIn: LOGIN_CODE_TTL_SEC };
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }
    throw new AppError('INTERNAL');
  },

  /**
   * Kodni tekshiradi va atomik "ishlatildi" deb belgilaydi (parallel so'rovlardan faqat bittasi o'tadi).
   * Qaytaradi: kod egasi userId.
   */
  async consume(rawCode: string, ip: string | undefined): Promise<string> {
    const ipCheck = await hitWithTtl(`logincode:verify:${clientKey(ip)}`, VERIFY_PER_IP.limit, VERIFY_PER_IP.windowSec);
    if (!ipCheck.allowed) throw new AppError('LOGIN_ATTEMPTS_LIMIT', undefined, { retryAfter: ipCheck.retryAfter });
    if ((await peek('logincode:fail:global')) >= GLOBAL_FAILS_PER_MIN) throw new AppError('TRY_AGAIN', undefined, { retryAfter: 30 });

    const code = normalizeLoginCode(rawCode);
    const row = await prisma.loginCode.findUnique({ where: { codeHash: hashLoginCode(code) } });
    const now = new Date();
    const used =
      row && !row.usedAt && row.expiresAt > now
        ? await prisma.loginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } })
        : { count: 0 };

    if (!row || used.count === 0) {
      await hitWithTtl('logincode:fail:global', Number.MAX_SAFE_INTEGER, 60);
      throw new AppError('LOGIN_CODE_INVALID');
    }
    return row.userId;
  },
};

/** Muddati o'tgan va ishlatilgan kodlarni o'chiradi (cron). */
export async function purgeLoginCodes(now = new Date()): Promise<number> {
  const res = await prisma.loginCode.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  return res.count;
}
