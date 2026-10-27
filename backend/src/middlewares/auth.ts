import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authorization: Bearer <access token>. Foydalanuvchi har so'rovda bazadan olinadi,
 * shuning uchun bloklash va rol o'zgarishi darhol kuchga kiradi.
 * Bloklangan foydalanuvchi faqat o'qiy oladi.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED');

  const { sub } = verifyAccessToken(header.slice(7));
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, role: true, isBlocked: true },
  });
  if (!user) throw new AppError('UNAUTHORIZED');
  if (user.isBlocked && !SAFE_METHODS.has(req.method)) throw new AppError('USER_BLOCKED');

  req.user = { id: user.id, role: user.role };
  next();
}

/** Token bo'lsa foydalanuvchini aniqlaydi, bo'lmasa davom etadi. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

/** Controller ichida autentifikatsiyalangan foydalanuvchini olish. */
export function currentUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new AppError('UNAUTHORIZED');
  return req.user;
}
