import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { notificationsController } from './notifications.controller.js';
import { listNotificationsQuery, notificationIdParams } from './notifications.schema.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', validate({ query: listNotificationsQuery }), notificationsController.list);
notificationsRouter.post('/read-all', notificationsController.readAll);
notificationsRouter.post('/:id/read', validate({ params: notificationIdParams }), notificationsController.read);
