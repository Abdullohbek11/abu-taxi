import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { notify } from '../notifications/notifications.service.js';
import { tripIdParams } from '../trips/trips.schema.js';
import { bookingIdParams, createBookingBody, myBookingsQuery } from './bookings.schema.js';
import { bookingsService } from './bookings.service.js';

export const bookingsController = {
  async create(req: Request, res: Response) {
    const { booking, driverUserId } = await bookingsService.create(currentUser(req).id, input(req, 'body', createBookingBody));
    await notify(driverUserId, 'booking:new', { bookingId: booking.id, tripId: booking.tripId, seats: booking.seats, status: booking.status });
    return created(res, booking);
  },

  async listMine(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', myBookingsQuery);
    const { items, nextCursor } = await bookingsService.listMine(currentUser(req).id, status, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async pendingForDriver(req: Request, res: Response) {
    return ok(res, await bookingsService.pendingForDriver(currentUser(req).id));
  },

  async getById(req: Request, res: Response) {
    const { id } = input(req, 'params', bookingIdParams);
    return ok(res, await bookingsService.getById(currentUser(req).id, id));
  },

  async confirm(req: Request, res: Response) {
    const { id } = input(req, 'params', bookingIdParams);
    const { booking, passengerId } = await bookingsService.confirm(currentUser(req).id, id);
    await notify(passengerId, 'booking:updated', { bookingId: id, tripId: booking.tripId, status: booking.status });
    return ok(res, booking);
  },

  async reject(req: Request, res: Response) {
    const { id } = input(req, 'params', bookingIdParams);
    const { booking, passengerId } = await bookingsService.reject(currentUser(req).id, id);
    await notify(passengerId, 'booking:updated', { bookingId: id, tripId: booking.tripId, status: booking.status });
    return ok(res, booking);
  },

  async cancel(req: Request, res: Response) {
    const { id } = input(req, 'params', bookingIdParams);
    const { booking, driverUserId } = await bookingsService.cancel(currentUser(req).id, id);
    await notify(driverUserId, 'booking:updated', {
      bookingId: id,
      tripId: booking.tripId,
      status: booking.status,
      cancelledLate: booking.cancelledLate,
    });
    return ok(res, booking);
  },

  async listForTrip(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    return ok(res, await bookingsService.listForTrip(currentUser(req).id, id));
  },
};
