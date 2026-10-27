import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/role.js';
import { uploadImage, uploadLimit } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { driversController } from './drivers.controller.js';
import { registerDriverBody, uploadDocumentBody } from './drivers.schema.js';

export const driversRouter = Router();

driversRouter.use(authenticate);

// Ro'yxatdan o'tish har qanday rolli (yoki hali rolsiz) foydalanuvchi uchun ochiq
driversRouter.post('/register', validate({ body: registerDriverBody }), driversController.register);
driversRouter.get('/me', requireRole('DRIVER'), driversController.getMe);
driversRouter.get('/me/stats', requireRole('DRIVER'), driversController.stats);
driversRouter.post(
  '/me/documents',
  requireRole('DRIVER'),
  uploadLimit,
  uploadImage, // multipart: type + file
  validate({ body: uploadDocumentBody }),
  driversController.uploadDocument,
);
