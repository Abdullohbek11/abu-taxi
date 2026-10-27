import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/role.js';
import { uploadImage, uploadLimit } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { billingController } from './billing.controller.js';
import { cardPaymentBody, onlinePaymentBody } from './billing.schema.js';

/** /api/v1/billing — haydovchi tarifi: rekvizitlar, obuna holati, to'lov (chek yoki Payme/Click). */
export const billingRouter = Router();
billingRouter.use(authenticate, requireRole('DRIVER'));

billingRouter.get('/plan', billingController.plan);
// multipart: file (chek rasmi, ixtiyoriy) + note
billingRouter.post('/payments', uploadLimit, uploadImage, validate({ body: cardPaymentBody }), billingController.createCardPayment);
billingRouter.post('/payments/online', validate({ body: onlinePaymentBody }), billingController.createOnlinePayment);
