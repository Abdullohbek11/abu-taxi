import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { createReviewBody, userReviewsParams, userReviewsQuery } from './reviews.schema.js';
import { reviewsService } from './reviews.service.js';

export const reviewsController = {
  async create(req: Request, res: Response) {
    const { review } = await reviewsService.create(currentUser(req).id, input(req, 'body', createReviewBody));
    return created(res, review);
  },

  async recent(req: Request, res: Response) {
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 12);
    return ok(res, await reviewsService.recent(limit));
  },

  async listForUser(req: Request, res: Response) {
    const { id } = input(req, 'params', userReviewsParams);
    const { limit, cursor, role } = input(req, 'query', userReviewsQuery);
    const { items, nextCursor } = await reviewsService.listForUser(id, limit, cursor, role);
    return ok(res, items, { nextCursor });
  },
};
