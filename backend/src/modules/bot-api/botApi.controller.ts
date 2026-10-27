import type { Request, Response } from 'express';
import { ok } from '../../lib/response.js';
import { input } from '../../middlewares/validate.js';
import { ackNotificationsBody, loginCodeRequestBody, pendingNotificationsQuery } from './botApi.schema.js';
import { botApiService } from './botApi.service.js';
import { notify } from '../notifications/notifications.service.js';
import { botGroupPostedBody, botTakeBody, botTelegramBody, rideRequestIdParams } from '../ride-requests/rideRequests.schema.js';
import { rideRequestsService } from '../ride-requests/rideRequests.service.js';

export const botApiController = {
  async loginCode(req: Request, res: Response) {
    return ok(res, await botApiService.loginCode(input(req, 'body', loginCodeRequestBody)));
  },

  async pendingNotifications(req: Request, res: Response) {
    return ok(res, await botApiService.pendingNotifications(input(req, 'query', pendingNotificationsQuery).limit));
  },

  async ackNotifications(req: Request, res: Response) {
    return ok(res, await botApiService.ackNotifications(input(req, 'body', ackNotificationsBody).ids));
  },

  async rideGroupQueue(_req: Request, res: Response) {
    return ok(res, await rideRequestsService.groupQueue());
  },

  async rideCheck(req: Request, res: Response) {
    const { id } = input(req, 'params', rideRequestIdParams);
    return ok(res, await rideRequestsService.botCheck(input(req, 'body', botTelegramBody).telegramId, id));
  },

  /** Haydovchi botda narxni yozdi. Yo'lovchiga xabar navbat orqali boradi; haydovchiga bot o'zi javob beradi. */
  async rideTake(req: Request, res: Response) {
    const { id } = input(req, 'params', rideRequestIdParams);
    const { telegramId, pricePerSeat } = input(req, 'body', botTakeBody);
    const r = await rideRequestsService.botTake(telegramId, id, pricePerSeat);
    await notify(r.passengerId, 'ride:request:assigned', r.toPassenger);
    return ok(res, r.toDriver);
  },

  async rideGroupPosted(req: Request, res: Response) {
    const { id } = input(req, 'params', rideRequestIdParams);
    const { chatId, messageId } = input(req, 'body', botGroupPostedBody);
    return ok(res, await rideRequestsService.groupPosted(id, chatId, messageId));
  },

  async rideGroupClosed(req: Request, res: Response) {
    return ok(res, await rideRequestsService.groupClosed(input(req, 'params', rideRequestIdParams).id));
  },
};
