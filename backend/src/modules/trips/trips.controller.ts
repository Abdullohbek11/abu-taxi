import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { bookingsService } from '../bookings/bookings.service.js';
import { notify } from '../notifications/notifications.service.js';
import { toTripDto } from './trips.dto.js';
import { createTripBody, myTripsQuery, searchTripsQuery, tripIdParams, updateTripBody } from './trips.schema.js';
import { tripsService } from './trips.service.js';

/** Safar holati o'zgarganda har bir ta'sirlangan yo'lovchiga xabar. */
async function notifyPassengers(
  tripId: string,
  status: string,
  bookings: { id: string; passengerId: string }[],
  extra: Record<string, unknown> = {},
) {
  await Promise.all(bookings.map((b) => notify(b.passengerId, 'trip:updated', { tripId, bookingId: b.id, status, ...extra })));
}

export const tripsController = {
  async search(req: Request, res: Response) {
    const { items, nextCursor } = await tripsService.search(input(req, 'query', searchTripsQuery));
    return ok(res, items, { nextCursor });
  },

  async getById(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    const { trip, reviews, takenSeats } = await tripsService.getById(id);
    // Tizimga kirgan foydalanuvchi o'z band qilishini (va tasdiqlangan bo'lsa — kontaktni) ko'radi
    const myBooking = req.user ? await bookingsService.viewerBooking(req.user.id, id) : null;
    return ok(res, { ...toTripDto(trip), takenSeats, driverReviews: reviews, myBooking });
  },

  async create(req: Request, res: Response) {
    return created(res, await tripsService.create(currentUser(req).id, input(req, 'body', createTripBody)));
  },

  async update(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    const body = input(req, 'body', updateTripBody);
    const trip = await tripsService.update(currentUser(req).id, id, body);
    await notifyPassengers(id, trip.status, await bookingsService.holdingPassengers(id), { changes: Object.keys(body) });
    return ok(res, trip);
  },

  async cancel(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    const { trip, affectedBookings } = await tripsService.cancel(currentUser(req).id, id);
    await notifyPassengers(id, trip.status, affectedBookings);
    return ok(res, trip);
  },

  async start(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    const { trip, affectedBookings } = await tripsService.start(currentUser(req).id, id);
    // Tasdiqlanmagan so'rovlar rad etildi
    await Promise.all(
      affectedBookings.map((b) => notify(b.passengerId, 'booking:updated', { bookingId: b.id, tripId: id, status: 'REJECTED' })),
    );
    await notifyPassengers(id, trip.status, await bookingsService.holdingPassengers(id));
    return ok(res, trip);
  },

  async complete(req: Request, res: Response) {
    const { id } = input(req, 'params', tripIdParams);
    const { trip, affectedBookings } = await tripsService.complete(currentUser(req).id, id);
    await notifyPassengers(id, trip.status, affectedBookings);
    return ok(res, trip);
  },

  async listMine(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', myTripsQuery);
    const { items, nextCursor } = await tripsService.listMine(currentUser(req).id, status, limit, cursor);
    return ok(res, items, { nextCursor });
  },
};
