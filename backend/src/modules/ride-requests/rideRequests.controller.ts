import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { notify, notifyMany } from '../notifications/notifications.service.js';
import {
  createRideRequestBody,
  myRideRequestsQuery,
  openRideRequestsQuery,
  rideRequestIdParams,
  takeRideRequestBody,
} from './rideRequests.schema.js';
import { rideRequestsService } from './rideRequests.service.js';
import { cursorQuery } from '../../lib/pagination.js';

export const rideRequestsController = {
  async create(req: Request, res: Response) {
    const { request, payload, driverUserIds } = await rideRequestsService.create(currentUser(req).id, input(req, 'body', createRideRequestBody));
    await notifyMany(driverUserIds, 'ride:request:new', payload);
    return created(res, request);
  },

  async listMine(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', myRideRequestsQuery);
    const { items, nextCursor } = await rideRequestsService.listMine(currentUser(req).id, status, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async listOpen(req: Request, res: Response) {
    const { items, nextCursor } = await rideRequestsService.listOpen(currentUser(req).id, input(req, 'query', openRideRequestsQuery));
    return ok(res, items, { nextCursor });
  },

  async listAssigned(req: Request, res: Response) {
    const { limit, cursor } = input(req, 'query', cursorQuery);
    const { items, nextCursor } = await rideRequestsService.listAssigned(currentUser(req).id, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async take(req: Request, res: Response) {
    const { id } = input(req, 'params', rideRequestIdParams);
    const { pricePerSeat, vehicleId } = input(req, 'body', takeRideRequestBody);
    const userId = currentUser(req).id;
    const r = await rideRequestsService.take(userId, id, pricePerSeat, vehicleId);
    await notify(r.passengerId, 'ride:request:assigned', r.toPassenger);
    await notify(userId, 'ride:request:taken', r.toDriver);
    return ok(res, r.request);
  },

  async cancel(req: Request, res: Response) {
    const { id } = input(req, 'params', rideRequestIdParams);
    const { request, driverUserId } = await rideRequestsService.cancel(currentUser(req).id, id);
    await notify(driverUserId, 'ride:request:updated', { requestId: id, status: 'CANCELLED' });
    return ok(res, request);
  },
};
