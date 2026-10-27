import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { clientKey, hitWithTtl } from '../lib/rateLimit.js';

/**
 * Jarayon xotirasidagi hisoblagich — har so'rovda bazaga yozmaslik uchun (global limit).
 * Bitta API instansiyasi uchun aniq; bir nechta instansiyada har biri o'z hisobini yuritadi.
 */
const memory = new Map<string, { count: number; resetAt: number }>();
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
}, 60_000);
sweep.unref();

function hitMemory(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, retryAfter: Math.max(Math.ceil((entry.resetAt - now) / 1000), 1) };
}

/** Testlar uchun */
export function resetMemoryLimits() {
  memory.clear();
}

/** Testlar uchun: xotiradagi hisoblagichni oshirish (minglab so'rov yubormasdan limitni sinash). */
export function rateLimitMemoryHit(key: string, windowSec = 60) {
  return hitMemory(key, Number.MAX_SAFE_INTEGER, windowSec);
}

/**
 * Cheklov: standart holatda IP bo'yicha; `by: 'user'` bo'lsa — autentifikatsiyalangan foydalanuvchi bo'yicha.
 * Limitdan oshsa 429 + Retry-After.
 */
export function rateLimit(opts: {
  name: string;
  limit: number;
  windowSec: number;
  by?: 'ip' | 'user';
  /** 'db' — MySQL (instansiyalar orasida umumiy, xavfsizlik uchun muhim limitlar); 'memory' — tez, global limit uchun */
  store?: 'db' | 'memory';
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const who = opts.by === 'user' && req.user ? `u:${req.user.id}` : clientKey(req.ip);
    const key = `${opts.name}:${who}`;
    const { allowed, retryAfter } =
      opts.store === 'memory' ? hitMemory(key, opts.limit, opts.windowSec) : await hitWithTtl(key, opts.limit, opts.windowSec);
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      throw new AppError('RATE_LIMITED');
    }
    next();
  };
}
