import { Router } from 'express';
import { cursorQuery } from '../../lib/pagination.js';
import { authenticate } from '../../middlewares/auth.js';
import { requireAnyRole, requireRole } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import { rideRequestsController } from './rideRequests.controller.js';
import {
  createRideRequestBody,
  myRideRequestsQuery,
  openRideRequestsQuery,
  rideRequestIdParams,
  takeRideRequestBody,
} from './rideRequests.schema.js';

export const rideRequestsRouter = Router();
rideRequestsRouter.use(authenticate, requireAnyRole);

rideRequestsRouter.post('/', validate({ body: createRideRequestBody }), rideRequestsController.create);
rideRequestsRouter.get('/my', validate({ query: myRideRequestsQuery }), rideRequestsController.listMine);
rideRequestsRouter.get('/open', requireRole('DRIVER'), validate({ query: openRideRequestsQuery }), rideRequestsController.listOpen);
rideRequestsRouter.get('/assigned', requireRole('DRIVER'), validate({ query: cursorQuery }), rideRequestsController.listAssigned);
rideRequestsRouter.post('/:id/take', requireRole('DRIVER'), validate({ params: rideRequestIdParams, body: takeRideRequestBody }), rideRequestsController.take);
rideRequestsRouter.post('/:id/cancel', validate({ params: rideRequestIdParams }), rideRequestsController.cancel);
