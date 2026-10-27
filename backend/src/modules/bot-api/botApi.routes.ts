import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { validate } from '../../middlewares/validate.js';
import { botGroupPostedBody, botTakeBody, botTelegramBody, rideRequestIdParams } from '../ride-requests/rideRequests.schema.js';
import { botApiController } from './botApi.controller.js';
import { ackNotificationsBody, loginCodeRequestBody, pendingNotificationsQuery } from './botApi.schema.js';

/** Ichki API faqat bot uchun: X-Bot-Secret sarlavhasi (vaqtga chidamli solishtirish). */
function requireBotSecret(req: Request, _res: Response, next: NextFunction) {
  const given = Buffer.from(String(req.headers['x-bot-secret'] ?? ''));
  const expected = Buffer.from(env.BOT_API_SECRET);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError('BOT_UNAUTHORIZED');
  next();
}

/**
 * /api/v1/internal/bot — Telegram bot (bot/ papkasi) bilan aloqa.
 * Production'da nginx orqali tashqariga yopiladi; bot API'ga ichki tarmoqdan ulanadi.
 */
export const botApiRouter = Router();
botApiRouter.use(requireBotSecret);

botApiRouter.post('/login-code', validate({ body: loginCodeRequestBody }), botApiController.loginCode);
botApiRouter.get('/notifications', validate({ query: pendingNotificationsQuery }), botApiController.pendingNotifications);
botApiRouter.post('/notifications/ack', validate({ body: ackNotificationsBody }), botApiController.ackNotifications);

// Safar so'rovlari: "Olaman" (haydovchi narx yozadi) va Telegram guruh navbati
botApiRouter.get('/ride-requests/group-queue', botApiController.rideGroupQueue);
botApiRouter.post('/ride-requests/:id/check', validate({ params: rideRequestIdParams, body: botTelegramBody }), botApiController.rideCheck);
botApiRouter.post('/ride-requests/:id/take', validate({ params: rideRequestIdParams, body: botTakeBody }), botApiController.rideTake);
botApiRouter.post('/ride-requests/:id/group-posted', validate({ params: rideRequestIdParams, body: botGroupPostedBody }), botApiController.rideGroupPosted);
botApiRouter.post('/ride-requests/:id/group-closed', validate({ params: rideRequestIdParams }), botApiController.rideGroupClosed);
