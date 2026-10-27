import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
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
import { notify, notifyMany } from '../notifications/notifications.service.js';
import { cargoService } from './cargo.service.js';

export const cargoController = {
  async create(req: Request, res: Response) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const cargo = await cargoService.create(currentUser(req).id, input(req, 'body', createCargoBody), files.map((f) => f.buffer));
    return created(res, cargo);
  },

  async listMine(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', myCargoQuery);
    const { items, nextCursor } = await cargoService.listMine(currentUser(req).id, status, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async listOpen(req: Request, res: Response) {
    const { items, nextCursor } = await cargoService.listOpen(currentUser(req).id, input(req, 'query', openCargoQuery));
    return ok(res, items, { nextCursor });
  },

  async getById(req: Request, res: Response) {
    return ok(res, await cargoService.getById(input(req, 'params', cargoIdParams).id, currentUser(req)));
  },

  async cancel(req: Request, res: Response) {
    const { cargo, driverUserIds } = await cargoService.cancel(currentUser(req).id, input(req, 'params', cargoIdParams).id);
    await notifyMany(driverUserIds, 'cargo:updated', { cargoId: cargo.id, status: cargo.status });
    return ok(res, cargo);
  },

  async setStatus(req: Request, res: Response) {
    const { id } = input(req, 'params', cargoIdParams);
    const { status } = input(req, 'body', cargoStatusBody);
    const { cargo, counterpartUserId } = await cargoService.setStatus(currentUser(req).id, id, status);
    await notify(counterpartUserId, 'cargo:updated', { cargoId: id, status: cargo.status });
    return ok(res, cargo);
  },

  async createOffer(req: Request, res: Response) {
    const { id } = input(req, 'params', cargoIdParams);
    const { offer, senderId } = await cargoService.createOffer(currentUser(req).id, id, input(req, 'body', createOfferBody));
    await notify(senderId, 'cargo:offer:new', { cargoId: id, offerId: offer.id, price: offer.price });
    return created(res, offer);
  },

  async listOffers(req: Request, res: Response) {
    return ok(res, await cargoService.listOffers(currentUser(req).id, input(req, 'params', cargoIdParams).id));
  },

  async listMyOffers(req: Request, res: Response) {
    const { status, limit, cursor } = input(req, 'query', myOffersQuery);
    const { items, nextCursor } = await cargoService.listMyOffers(currentUser(req).id, status, limit, cursor);
    return ok(res, items, { nextCursor });
  },

  async acceptOffer(req: Request, res: Response) {
    const { offer, driverUserId, rejectedDriverUserIds } = await cargoService.acceptOffer(
      currentUser(req).id,
      input(req, 'params', offerIdParams).id,
    );
    const base = { cargoId: offer.cargoRequestId };
    await notify(driverUserId, 'cargo:offer:updated', { ...base, offerId: offer.id, status: 'ACCEPTED' });
    await notifyMany(rejectedDriverUserIds, 'cargo:offer:updated', { ...base, status: 'REJECTED' });
    return ok(res, offer);
  },

  async rejectOffer(req: Request, res: Response) {
    const { offer, driverUserId } = await cargoService.rejectOffer(currentUser(req).id, input(req, 'params', offerIdParams).id);
    await notify(driverUserId, 'cargo:offer:updated', { cargoId: offer.cargoRequestId, offerId: offer.id, status: offer.status });
    return ok(res, offer);
  },

  async withdrawOffer(req: Request, res: Response) {
    const { offer, senderId } = await cargoService.withdrawOffer(currentUser(req).id, input(req, 'params', offerIdParams).id);
    await notify(senderId, 'cargo:offer:updated', { cargoId: offer.cargoRequestId, offerId: offer.id, status: offer.status });
    return ok(res, offer);
  },
};
