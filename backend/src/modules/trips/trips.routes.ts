import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/role.js';
import { validate } from '../../middlewares/validate.js';
import { bookingsController } from '../bookings/bookings.controller.js';
import { tripsController } from './trips.controller.js';
import { createTripBody, myTripsQuery, searchTripsQuery, tripIdParams, updateTripBody } from './trips.schema.js';

export const tripsRouter = Router();

const driver = [authenticate, requireRole('DRIVER')];

tripsRouter.get('/', validate({ query: searchTripsQuery }), tripsController.search);
tripsRouter.get('/my', ...driver, validate({ query: myTripsQuery }), tripsController.listMine);
tripsRouter.get('/:id', optionalAuth, validate({ params: tripIdParams }), tripsController.getById);
tripsRouter.get('/:id/bookings', ...driver, validate({ params: tripIdParams }), bookingsController.listForTrip);
tripsRouter.post('/', ...driver, validate({ body: createTripBody }), tripsController.create);
tripsRouter.patch('/:id', ...driver, validate({ params: tripIdParams, body: updateTripBody }), tripsController.update);
tripsRouter.post('/:id/cancel', ...driver, validate({ params: tripIdParams }), tripsController.cancel);
tripsRouter.post('/:id/start', ...driver, validate({ params: tripIdParams }), tripsController.start);
tripsRouter.post('/:id/complete', ...driver, validate({ params: tripIdParams }), tripsController.complete);
