import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { uploadImage, uploadLimit } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { reviewsController } from '../reviews/reviews.controller.js';
import { userReviewsParams, userReviewsQuery } from '../reviews/reviews.schema.js';
import { usersController } from './users.controller.js';
import { setRoleBody, updateMeBody, userIdParams } from './users.schema.js';

export const usersRouter = Router();

usersRouter.get('/me', authenticate, usersController.getMe);
usersRouter.patch('/me', authenticate, validate({ body: updateMeBody }), usersController.updateMe);
usersRouter.post('/me/avatar', authenticate, uploadLimit, uploadImage, usersController.setAvatar);
usersRouter.patch('/me/role', authenticate, validate({ body: setRoleBody }), usersController.setRole);
usersRouter.get('/:id/public', validate({ params: userIdParams }), usersController.getPublic);
usersRouter.get('/:id/reviews', validate({ params: userReviewsParams, query: userReviewsQuery }), reviewsController.listForUser);
