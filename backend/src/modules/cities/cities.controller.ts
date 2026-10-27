import type { Request, Response } from 'express';
import { ok } from '../../lib/response.js';
import { citiesService } from './cities.service.js';

/** Shaharlar deyarli o'zgarmaydi — jarayon xotirasida 1 soat keshlanadi. */
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { data: Awaited<ReturnType<typeof citiesService.list>>; expiresAt: number } | null = null;

export function clearCitiesCache() {
  cache = null;
}

export const citiesController = {
  async list(_req: Request, res: Response) {
    if (!cache || cache.expiresAt < Date.now()) {
      cache = { data: await citiesService.list(), expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return ok(res, cache.data);
  },
};
