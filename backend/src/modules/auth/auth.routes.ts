import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import { authController } from './auth.controller.js';
import { adminLoginBody, loginCodeBody, refreshBody } from './auth.schema.js';

export const authRouter = Router();

const refreshLimit = rateLimit({ name: 'refresh', limit: 120, windowSec: 3600 });

// Kod tekshirish limitlari (IP va umumiy) loginCode.service ichida — DB'da, instansiyalar orasida umumiy
authRouter.post('/code', validate({ body: loginCodeBody }), authController.loginWithCode);
// Limitlar (IP va hisob bo'yicha) adminAuth.service ichida — DB'da
authRouter.post('/admin/login', validate({ body: adminLoginBody }), authController.adminLogin);
authRouter.post('/refresh', refreshLimit, validate({ body: refreshBody }), authController.refresh);
authRouter.post('/logout', validate({ body: refreshBody }), authController.logout);
authRouter.post('/logout-all', authenticate, authController.logoutAll);
