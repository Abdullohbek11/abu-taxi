import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { ok } from './lib/response.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { rateLimit } from './middlewares/rateLimit.js';
import { botApiRouter } from './modules/bot-api/botApi.routes.js';
import { filesRouter } from './modules/files/files.routes.js';
import { apiRouter } from './routes.js';

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Nechta proxy ortida ekanini aniq ko'rsatamiz — aks holda X-Forwarded-For soxtalashtirilib, IP limitlari aylanib o'tiladi
  app.set('trust proxy', env.TRUST_PROXY);

  if (env.DOCS_ENABLED) {
    // Swagger UI inline uslublar ishlatadi — /docs uchun CSP o'chirilgan, qolgan helmet himoyasi saqlanadi
    const openapi = buildOpenApiDocument();
    app.get('/docs.json', (_req, res) => res.json(openapi));
    app.use('/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Abu Tax API' }));
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Client', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  // API body'lari kichik (fayllar multipart orqali alohida cheklanadi)
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        // Faqat usul va yo'l (query'siz) — sarlavhalar, cookie va body logga tushmaydi
        req: (req) => ({ id: req.id, method: req.method, path: String(req.url).split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Lokal saqlashda fayllarni API o'zi tarqatadi (S3'da — bucket/CDN)
  if (env.STORAGE_DRIVER === 'local') app.use(filesRouter());

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ok' });
  });

  // Bot ichki API'si (maxfiy kalit bilan) — umumiy IP limitidan tashqarida: bot bitta IP'dan barcha foydalanuvchilar nomidan murojaat qiladi
  app.use('/api/v1/internal/bot', botApiRouter);

  app.use('/api/v1', rateLimit({ name: 'global', limit: env.RATE_LIMIT_PER_MIN, windowSec: 60, store: 'memory' }), apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
