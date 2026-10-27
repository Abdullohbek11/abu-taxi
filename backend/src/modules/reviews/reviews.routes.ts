import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireAnyRole } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import { reviewsController } from './reviews.controller.js';
import { createReviewBody } from './reviews.schema.js';

export const reviewsRouter = Router();

reviewsRouter.get('/recent', reviewsController.recent);
reviewsRouter.post('/', authenticate, requireAnyRole, validate({ body: createReviewBody }), reviewsController.create);
