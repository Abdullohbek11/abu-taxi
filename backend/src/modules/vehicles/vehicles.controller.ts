import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { input } from '../../middlewares/validate.js';
import { createVehicleBody, photoParams, updateVehicleBody, vehicleIdParams } from './vehicles.schema.js';
import { vehiclesService } from './vehicles.service.js';

export const vehiclesController = {
  async list(req: Request, res: Response) {
    return ok(res, await vehiclesService.list(currentUser(req).id));
  },

  async get(req: Request, res: Response) {
    const { id } = input(req, 'params', vehicleIdParams);
    return ok(res, await vehiclesService.get(currentUser(req).id, id));
  },

  async create(req: Request, res: Response) {
    return created(res, await vehiclesService.create(currentUser(req).id, input(req, 'body', createVehicleBody)));
  },

  async update(req: Request, res: Response) {
    const { id } = input(req, 'params', vehicleIdParams);
    return ok(res, await vehiclesService.update(currentUser(req).id, id, input(req, 'body', updateVehicleBody)));
  },

  async remove(req: Request, res: Response) {
    const { id } = input(req, 'params', vehicleIdParams);
    await vehiclesService.remove(currentUser(req).id, id);
    return ok(res, null);
  },

  async addPhotos(req: Request, res: Response) {
    const { id } = input(req, 'params', vehicleIdParams);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new AppError('FILE_REQUIRED');
    return ok(res, await vehiclesService.addPhotos(currentUser(req).id, id, files.map((f) => f.buffer)));
  },

  async removePhoto(req: Request, res: Response) {
    const { id, index } = input(req, 'params', photoParams);
    return ok(res, await vehiclesService.removePhoto(currentUser(req).id, id, index));
  },
};
