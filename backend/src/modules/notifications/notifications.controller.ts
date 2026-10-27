import type { Request, Response } from 'express';
import { ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { listNotificationsQuery, notificationIdParams } from './notifications.schema.js';
import { notificationsService } from './notifications.service.js';

export const notificationsController = {
  async list(req: Request, res: Response) {
    const { limit, cursor, unread } = input(req, 'query', listNotificationsQuery);
    const { items, nextCursor, unreadCount } = await notificationsService.list(currentUser(req).id, limit, cursor, unread);
    return ok(res, items, { nextCursor, unreadCount });
  },

  async read(req: Request, res: Response) {
    return ok(res, await notificationsService.read(currentUser(req).id, input(req, 'params', notificationIdParams).id));
  },

  async readAll(req: Request, res: Response) {
    return ok(res, await notificationsService.readAll(currentUser(req).id));
  },
};
