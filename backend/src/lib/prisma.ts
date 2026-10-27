import { Prisma, PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: isProd ? ['error'] : ['warn', 'error'] });

if (!isProd) globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * InnoDB deadlock / lock timeout. Masalan: unique kalitli qator o'chirilib (delete-marked), xuddi shu kalitga
 * bir vaqtda bir nechta INSERT kelsa, InnoDB tranzaksiyalardan birini qurbon qiladi (1213 / P2034).
 */
const MYSQL_RETRYABLE = /Deadlock found|Lock wait timeout|\b1213\b|\b1205\b|write conflict or a deadlock/;

export function isDeadlock(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') return true;
  return err instanceof Error && MYSQL_RETRYABLE.test(err.message);
}

/**
 * Deadlock bo'lsa amalni qayta bajaradi. FAQAT to'liq orqaga qaytariladigan amallar uchun:
 * butun tranzaksiya yoki bitta atomik so'rov (tranzaksiya ichidagi alohida so'rov uchun EMAS —
 * deadlock'dan keyin MySQL butun tranzaksiyani bekor qiladi).
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isDeadlock(err)) throw err;
      // Kichik tasodifiy kutish — to'qnashgan so'rovlar yana bir vaqtda boshlanmasligi uchun
      await new Promise((r) => setTimeout(r, 10 * i + Math.random() * 40));
    }
  }
}

/** Interaktiv tranzaksiya: deadlock'da butunlay qayta bajariladi. */
export function transaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
  return withDeadlockRetry(() => prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 }), attempts);
}
