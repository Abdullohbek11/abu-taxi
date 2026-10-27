import { randomUUID } from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { prisma, withDeadlockRetry } from '../lib/prisma.js';
import { purgeExpiredCounters } from '../lib/rateLimit.js';
import { purgeLoginCodes } from '../modules/auth/loginCode.service.js';
import {
  autoCompleteTrips,
  cancelStaleScheduledTrips,
  expireOldCargo,
  expirePendingBookings,
  purgeExpiredRefreshTokens,
  expireRideRequestsJob,
} from './tasks.js';
import { subscriptionReminders } from '../modules/billing/billing.service.js';

/**
 * Bir nechta API instansiyasi bo'lsa, vazifani faqat bittasi bajaradi (MySQL JobLock qulfi).
 */
/**
 * MySQL `JobLock` jadvalidagi taqsimlangan qulf. Bo'sh yoki muddati o'tgan qulf atomik egallanadi
 * (`owner` avval eski `expiresAt` bilan tekshiriladi, keyin `expiresAt` yangilanadi).
 */
async function acquire(name: string, owner: string, ttlSec: number): Promise<boolean> {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSec * 1000);
  await withDeadlockRetry(
    () => prisma.$executeRaw`
      INSERT INTO JobLock (name, owner, expiresAt) VALUES (${name}, ${owner}, ${expires})
      ON DUPLICATE KEY UPDATE
        owner = IF(expiresAt <= ${now}, ${owner}, owner),
        expiresAt = IF(expiresAt <= ${now}, ${expires}, expiresAt)`,
  );
  const row = await prisma.jobLock.findUnique({ where: { name } });
  return row?.owner === owner;
}

/** Qulfni faqat uning egasi bo'shatadi (vazifa TTL'dan uzoq ishlasa, boshqaning qulfini o'chirmaslik uchun). */
async function release(name: string, owner: string) {
  await prisma.jobLock.deleteMany({ where: { name, owner } });
}

async function withLock(name: string, ttlSec: number, fn: () => Promise<number>) {
  const token = randomUUID();
  if (!(await acquire(name, token, ttlSec))) return;
  const started = Date.now();
  try {
    const count = await fn();
    if (count > 0) logger.info({ job: name, count, ms: Date.now() - started }, 'Cron vazifasi bajarildi');
  } catch (err) {
    logger.error({ err, job: name }, 'Cron vazifasi xato bilan tugadi');
  } finally {
    await release(name, token);
  }
}

const JOBS: { name: string; cron: string; ttlSec: number; run: () => Promise<number> }[] = [
  { name: 'auto-complete-trips', cron: '*/10 * * * *', ttlSec: 540, run: () => autoCompleteTrips() },
  { name: 'cancel-stale-trips', cron: '*/10 * * * *', ttlSec: 540, run: () => cancelStaleScheduledTrips() },
  { name: 'expire-pending-bookings', cron: '*/5 * * * *', ttlSec: 280, run: () => expirePendingBookings() },
  { name: 'subscription-reminders', cron: '0 10 * * *', ttlSec: 3600, run: () => subscriptionReminders() },
  { name: 'expire-ride-requests', cron: '5 0 * * *', ttlSec: 3600, run: () => expireRideRequestsJob() },
  { name: 'expire-old-cargo', cron: '0 3 * * *', ttlSec: 3600, run: () => expireOldCargo() },
  { name: 'purge-expired-counters', cron: '15 * * * *', ttlSec: 600, run: async () => (await purgeExpiredCounters()) + (await purgeLoginCodes()) },
  { name: 'purge-refresh-tokens', cron: '30 4 * * *', ttlSec: 3600, run: () => purgeExpiredRefreshTokens() },
];

export function startJobs(): ScheduledTask[] {
  const tasks = JOBS.map((job) =>
    cron.schedule(job.cron, () => withLock(job.name, job.ttlSec, job.run), {
      name: job.name,
      timezone: 'Asia/Tashkent',
      noOverlap: true,
    }),
  );
  logger.info(`Cron vazifalari ishga tushdi: ${JOBS.map((j) => j.name).join(', ')}`);
  return tasks;
}
