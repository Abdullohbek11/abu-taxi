import type { Request, Response } from 'express';
import { created, ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { requireFile } from '../../middlewares/upload.js';
import { input } from '../../middlewares/validate.js';
import { registerDriverBody, uploadDocumentBody } from './drivers.schema.js';
import { driversService } from './drivers.service.js';
import { driverStats } from './drivers.stats.js';

export const driversController = {
  async register(req: Request, res: Response) {
    return created(res, await driversService.register(currentUser(req).id, input(req, 'body', registerDriverBody)));
  },

  async getMe(req: Request, res: Response) {
    return ok(res, await driversService.getMe(currentUser(req).id));
  },

  async stats(req: Request, res: Response) {
    return ok(res, await driverStats(currentUser(req).id));
  },

  async uploadDocument(req: Request, res: Response) {
    const { type } = input(req, 'body', uploadDocumentBody);
    const file = requireFile(req.file);
    return created(res, await driversService.uploadDocument(currentUser(req).id, type, file.buffer));
  },
};
