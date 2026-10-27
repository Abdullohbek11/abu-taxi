import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { storage } from './lib/storage.js';
import { initSockets } from './sockets/index.js';
import { startJobs } from './jobs/index.js';

const app = createApp();
const server = createServer(app);
// Slowloris kabi sekin so'rovlar bilan ulanishlarni band qilishga qarshi
server.headersTimeout = 15_000;
server.requestTimeout = 60_000; // 30MB gacha multipart yuklash uchun yetarli
server.keepAliveTimeout = 65_000; // nginx keepalive'dan uzunroq
const io = initSockets(server);
const jobs = env.CRON_ENABLED ? startJobs() : [];

storage.init().catch((err) => logger.error({ err }, "Fayl saqlash joyini tayyorlab bo'lmadi"));

server.listen(env.PORT, () => {
  logger.info(`API ishga tushdi: http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} qabul qilindi, to'xtatilmoqda...`);
  await Promise.all(jobs.map((j) => j.stop()));
  await io.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Ushlanmagan promise xatosi'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Ushlanmagan xato — jarayon to\'xtatiladi');
  process.exit(1);
});

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
