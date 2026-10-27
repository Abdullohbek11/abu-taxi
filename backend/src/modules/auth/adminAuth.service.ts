import { AppError } from '../../lib/errors.js';
import { hashPassword, passwordProblem, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { clientKey, hitWithTtl, peek, resetCounter } from '../../lib/rateLimit.js';
import { audit } from '../admin/admin.service.js';
import { notify } from '../notifications/notifications.service.js';
import { authService, type SessionResult } from './auth.service.js';

/** IP bo'yicha: 15 daqiqada 10 ta urinish (to'g'ri yoki noto'g'ri). */
export const ADMIN_LOGIN_PER_IP = { limit: 10, windowSec: 15 * 60 };
/** Hisob bo'yicha: 30 daqiqada 5 ta noto'g'ri parol — hisob vaqtincha qulflanadi (taqsimlangan hujumga qarshi). */
export const ADMIN_LOGIN_FAILS = { limit: 5, windowSec: 30 * 60 };

const failKey = (login: string) => `adminlogin:fail:${login}`;

export const adminAuthService = {
  /**
   * Admin panelga parol bilan kirish. Xato sababi tashqariga aytilmaydi (bunday hisob yo'q, admin emas, parol
   * o'rnatilmagan, noto'g'ri parol, bloklangan — hammasi ADMIN_LOGIN_INVALID), javob vaqti ham bir xil.
   * Har bir muvaffaqiyatli kirish jurnalga yoziladi va adminning Telegram'iga xabar boradi.
   */
  async login(login: string, password: string, ip: string | undefined, userAgent?: string): Promise<SessionResult> {
    const ipHit = await hitWithTtl(`adminlogin:ip:${clientKey(ip)}`, ADMIN_LOGIN_PER_IP.limit, ADMIN_LOGIN_PER_IP.windowSec);
    if (!ipHit.allowed) throw new AppError('ADMIN_LOGIN_LOCKED', undefined, { retryAfter: ipHit.retryAfter });
    // Hisob qulfi kiritilgan login bo'yicha (hisob bor-yo'qligidan qat'i nazar) — qulf orqali admin borligini bilib bo'lmaydi
    if ((await peek(failKey(login))) >= ADMIN_LOGIN_FAILS.limit) {
      throw new AppError('ADMIN_LOGIN_LOCKED', undefined, { retryAfter: ADMIN_LOGIN_FAILS.windowSec });
    }

    const user = await prisma.user.findUnique({ where: { phone: login } });
    const candidate = user?.role === 'ADMIN' && !user.isBlocked ? user : null;
    const ok = await verifyPassword(password, candidate?.passwordHash);
    if (!candidate || !ok) {
      await hitWithTtl(failKey(login), Number.MAX_SAFE_INTEGER, ADMIN_LOGIN_FAILS.windowSec);
      throw new AppError('ADMIN_LOGIN_INVALID');
    }

    await resetCounter(failKey(login));
    const session = await authService.issueSession(candidate, userAgent, false);
    await audit(candidate.id, 'admin.login', { type: 'user', id: candidate.id }, { method: 'password' }, ip);
    await notify(candidate.id, 'security:admin-login', { ip: ip ?? null, userAgent: userAgent?.slice(0, 120) ?? null });
    return session;
  },

  /** Parolni o'rnatish yoki almashtirish. Parol bor bo'lsa — joriy parol majburiy. Boshqa sessiyalar yopiladi. */
  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string, ip?: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== 'ADMIN') throw new AppError('FORBIDDEN');
    if (user.passwordHash && !(await verifyPassword(currentPassword ?? '', user.passwordHash))) throw new AppError('PASSWORD_INCORRECT');
    await setAdminPassword(user.id, newPassword, user.phone);
    await audit(user.id, 'admin.password', { type: 'user', id: user.id }, undefined, ip);
    return { changed: true };
  },
};

/** CLI va panel uchun umumiy: talablarni tekshiradi, hashlaydi, eski sessiyalarni yopadi. */
export async function setAdminPassword(userId: string, password: string, phone: string | null) {
  const problem = passwordProblem(password, phone);
  if (problem) throw new AppError('WEAK_PASSWORD', { password: problem });
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
