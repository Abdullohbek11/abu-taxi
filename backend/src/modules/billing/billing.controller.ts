import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { cardPaymentBody, onlinePaymentBody } from './billing.schema.js';
import { billingService } from './billing.service.js';

export const billingController = {
  async plan(req: Request, res: Response) {
    return ok(res, await billingService.plan(currentUser(req).id));
  },

  async createCardPayment(req: Request, res: Response) {
    const { note } = input(req, 'body', cardPaymentBody);
    const file = req.file as Express.Multer.File | undefined;
    return created(res, await billingService.createCardPayment(currentUser(req).id, note, file?.buffer));
  },

  async createOnlinePayment(req: Request, res: Response) {
    const { provider } = input(req, 'body', onlinePaymentBody);
    return created(res, await billingService.createOnlinePayment(currentUser(req).id, provider));
  },
};
