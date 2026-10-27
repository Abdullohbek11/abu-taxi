import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.js';
import { requireRole } from '../../middlewares/role.js';
import { uploadImages, uploadLimit } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { vehiclesController } from './vehicles.controller.js';
import { createVehicleBody, photoParams, updateVehicleBody, vehicleIdParams } from './vehicles.schema.js';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate, requireRole('DRIVER'));

vehiclesRouter.get('/', vehiclesController.list);
vehiclesRouter.post('/', validate({ body: createVehicleBody }), vehiclesController.create);
vehiclesRouter.get('/:id', validate({ params: vehicleIdParams }), vehiclesController.get);
vehiclesRouter.patch('/:id', validate({ params: vehicleIdParams, body: updateVehicleBody }), vehiclesController.update);
vehiclesRouter.delete('/:id', validate({ params: vehicleIdParams }), vehiclesController.remove);
vehiclesRouter.post('/:id/photos', validate({ params: vehicleIdParams }), uploadLimit, uploadImages(6), vehiclesController.addPhotos);
vehiclesRouter.delete('/:id/photos/:index', validate({ params: photoParams }), vehiclesController.removePhoto);
