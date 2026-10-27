import { z } from 'zod';
import { freeText } from '../../lib/validators.js';
import { cursorQuery } from '../../lib/pagination.js';

export const createReviewBody = z
  .object({
    bookingId: z.string().min(1).max(40).optional(),
    cargoRequestId: z.string().min(1).max(40).optional(),
    rideRequestId: z.string().min(1).max(40).optional(),
    rating: z.number().int().min(1).max(5),
    text: freeText(1000).optional(),
  })
  .strict()
  .refine((b) => [b.bookingId, b.cargoRequestId, b.rideRequestId].filter(Boolean).length === 1, {
    path: ['bookingId'],
    message:
      'bookingId, cargoRequestId yoki rideRequestId dan bittasi kerak|Нужен ровно один из bookingId, cargoRequestId или rideRequestId',
  });

export const userReviewsParams = z.object({ id: z.string().min(1).max(40) });
export const userReviewsQuery = cursorQuery.extend({ role: z.enum(['DRIVER', 'CLIENT']).optional() });

export type CreateReviewBody = z.infer<typeof createReviewBody>;
