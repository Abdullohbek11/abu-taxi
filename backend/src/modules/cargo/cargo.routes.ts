import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireAnyRole, requireRole } from '../../middlewares/role.js';
import { uploadImages, uploadLimit } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { cargoController } from './cargo.controller.js';
import {
  cargoIdParams,
  cargoStatusBody,
  createCargoBody,
  createOfferBody,
  myCargoQuery,
  myOffersQuery,
  offerIdParams,
  openCargoQuery,
} from './cargo.schema.js';
import { MAX_CARGO_PHOTOS } from './cargo.service.js';

export const cargoRouter = Router();
cargoRouter.use(authenticate, requireAnyRole);

cargoRouter.post('/', uploadLimit, uploadImages(MAX_CARGO_PHOTOS), validate({ body: createCargoBody }), cargoController.create);
cargoRouter.get('/my', validate({ query: myCargoQuery }), cargoController.listMine);
cargoRouter.get('/open', requireRole('DRIVER'), validate({ query: openCargoQuery }), cargoController.listOpen);
cargoRouter.get('/:id', validate({ params: cargoIdParams }), cargoController.getById);
cargoRouter.post('/:id/cancel', validate({ params: cargoIdParams }), cargoController.cancel);
cargoRouter.post('/:id/status', validate({ params: cargoIdParams, body: cargoStatusBody }), cargoController.setStatus);
cargoRouter.post('/:id/offers', requireRole('DRIVER'), validate({ params: cargoIdParams, body: createOfferBody }), cargoController.createOffer);
cargoRouter.get('/:id/offers', validate({ params: cargoIdParams }), cargoController.listOffers);

export const offersRouter = Router();
offersRouter.use(authenticate, requireAnyRole);

offersRouter.get('/my', requireRole('DRIVER'), validate({ query: myOffersQuery }), cargoController.listMyOffers);
offersRouter.post('/:id/accept', validate({ params: offerIdParams }), cargoController.acceptOffer);
offersRouter.post('/:id/reject', validate({ params: offerIdParams }), cargoController.rejectOffer);
offersRouter.post('/:id/withdraw', requireRole('DRIVER'), validate({ params: offerIdParams }), cargoController.withdrawOffer);
