import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export interface AccessPayload {
  sub: string;
  role: Role | null;
}

const ISSUER = 'abutax';
const ACCESS_AUD = 'abutax:access';
const REFRESH_AUD = 'abutax:refresh';

export interface RefreshPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL_SEC,
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: ACCESS_AUD,
  });
}

export function verifyAccessToken(token: string): AccessPayload & { exp: number } {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: ACCESS_AUD,
    }) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string' || typeof decoded.exp !== 'number') throw new AppError('TOKEN_INVALID');
    return { sub: decoded.sub, role: (decoded.role ?? null) as Role | null, exp: decoded.exp };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError('TOKEN_EXPIRED');
    throw new AppError('TOKEN_INVALID');
  }
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_SEC,
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: REFRESH_AUD,
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: REFRESH_AUD,
    }) as jwt.JwtPayload;
    if (typeof decoded.sub !== 'string' || typeof decoded.jti !== 'string') throw new Error('payload');
    return { sub: decoded.sub, jti: decoded.jti };
  } catch {
    throw new AppError('TOKEN_INVALID');
  }
}

/** Bazada refresh token o'zi emas, faqat uning SHA-256 hash'i saqlanadi. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
