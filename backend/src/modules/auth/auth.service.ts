import type { User } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { REFRESH_TTL_SEC, hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { toMeDto } from '../users/users.service.js';
import { loginCodeService } from './loginCode.service.js';

const REUSE_GRACE_MS = 10_000;

async function revokeAll(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: ReturnType<typeof toMeDto>;
  isNew: boolean;
}

async function issueSession(user: User, userAgent: string | undefined, isNew: boolean): Promise<SessionResult> {
  if (user.isBlocked) throw new AppError('USER_BLOCKED');

  const { token } = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      userAgent: userAgent?.slice(0, 255),
    },
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: token,
    user: toMeDto(user),
    isNew,
  };
}

export const authService = {
  issueSession,

  /**
   * Botdan olingan kod bilan kirish. Foydalanuvchi bot orqali (Telegram kontakti bilan) allaqachon
   * yaratilgan; `isNew` — hali rol tanlanmagan (onboarding kerak).
   */
  async loginWithCode(code: string, ip: string | undefined, userAgent?: string): Promise<SessionResult> {
    const userId = await loginCodeService.consume(code, ip);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return issueSession(user, userAgent, user.role === null);
  },

  /**
   * Refresh token rotatsiyasi. Almashtirilgan token qayta ishlatilsa — token o'g'irlangan deb hisoblanib,
   * foydalanuvchining barcha sessiyalari yopiladi. Istisno: rotatsiyadan keyingi 10 soniya ichida
   * (bir nechta tab bir vaqtda yangilaganda) — 409 REFRESH_IN_PROGRESS: sessiyalar yopilmaydi va cookie'dagi
   * yangi token o'chirilmaydi, mijoz qayta urinadi.
   */
  async refresh(token: string, userAgent?: string): Promise<SessionResult> {
    const { sub } = verifyRefreshToken(token);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!stored || stored.userId !== sub) throw new AppError('TOKEN_INVALID');

    if (stored.revokedAt) {
      const benign = stored.rotatedAt && Date.now() - stored.rotatedAt.getTime() < REUSE_GRACE_MS;
      if (benign) throw new AppError('REFRESH_IN_PROGRESS');
      await revokeAll(stored.userId);
      logger.warn({ userId: stored.userId }, 'Refresh token qayta ishlatildi — barcha sessiyalar bekor qilindi');
      throw new AppError('REFRESH_TOKEN_REUSED');
    }
    if (stored.expiresAt < new Date()) throw new AppError('TOKEN_EXPIRED');

    // Poyga holati: ikki parallel so'rovdan faqat bittasi tokenni almashtira oladi
    const now = new Date();
    const revoked = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    if (revoked.count === 0) throw new AppError('REFRESH_IN_PROGRESS');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    return issueSession(user, userAgent, false);
  },

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async logoutAll(userId: string): Promise<void> {
    await revokeAll(userId);
  },
};
