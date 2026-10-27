import { Router, type Request, type Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { ok } from '../../lib/response.js';

/** Landing uchun haqiqiy ko'rsatkichlar (soxta "1200+ safar" o'rniga). 5 daqiqa keshlanadi. */
const TTL_MS = 5 * 60_000;
let cache: { data: { trips: number; drivers: number; rating: number | null }; expiresAt: number } | null = null;

export async function publicStats() {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  const [trips, drivers, rated] = await Promise.all([
    prisma.trip.count({ where: { status: 'COMPLETED' } }),
    prisma.driverProfile.count({ where: { status: 'APPROVED', user: { isBlocked: false } } }),
    // Haydovchilar reytingi sharhlar soni bo'yicha o'rtacha (bitta sharhli 5.0 umumiy bahoni buzmasligi uchun)
    prisma.review.aggregate({ where: { targetUser: { driverProfile: { status: 'APPROVED' } } }, _avg: { rating: true }, _count: true }),
  ]);
  const data = { trips, drivers, rating: rated._count > 0 ? Number((rated._avg.rating ?? 0).toFixed(1)) : null };
  cache = { data, expiresAt: Date.now() + TTL_MS };
  return data;
}

export function clearStatsCache() {
  cache = null;
}

export const statsRouter = Router();
statsRouter.get('/public', async (_req: Request, res: Response) => ok(res, await publicStats()));
