import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireAnyRole, requireRole } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import { bookingsController } from './bookings.controller.js';
import { bookingIdParams, createBookingBody, myBookingsQuery } from './bookings.schema.js';

export const bookingsRouter = Router();

bookingsRouter.use(authenticate, requireAnyRole);

bookingsRouter.post('/', validate({ body: createBookingBody }), bookingsController.create);
bookingsRouter.get('/my', validate({ query: myBookingsQuery }), bookingsController.listMine);
bookingsRouter.get('/pending-for-driver', requireRole('DRIVER'), bookingsController.pendingForDriver);
bookingsRouter.get('/:id', validate({ params: bookingIdParams }), bookingsController.getById);
bookingsRouter.post('/:id/confirm', requireRole('DRIVER'), validate({ params: bookingIdParams }), bookingsController.confirm);
bookingsRouter.post('/:id/reject', requireRole('DRIVER'), validate({ params: bookingIdParams }), bookingsController.reject);
bookingsRouter.post('/:id/cancel', validate({ params: bookingIdParams }), bookingsController.cancel);
