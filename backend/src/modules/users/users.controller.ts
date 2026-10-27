import type { Request, Response } from 'express';
import { ok } from '../../lib/response.js';
import { currentUser } from '../../middlewares/auth.js';
import { requireFile } from '../../middlewares/upload.js';
import { input } from '../../middlewares/validate.js';
import { setRoleBody, updateMeBody, userIdParams } from './users.schema.js';
import { usersService } from './users.service.js';

export const usersController = {
  async getMe(req: Request, res: Response) {
    return ok(res, await usersService.getMe(currentUser(req).id));
  },

  async updateMe(req: Request, res: Response) {
    return ok(res, await usersService.updateMe(currentUser(req).id, input(req, 'body', updateMeBody)));
  },

  async setAvatar(req: Request, res: Response) {
    return ok(res, await usersService.setAvatar(currentUser(req).id, requireFile(req.file).buffer));
  },

  async setRole(req: Request, res: Response) {
    const { role } = input(req, 'body', setRoleBody);
    return ok(res, await usersService.setRole(currentUser(req).id, role));
  },

  async getPublic(req: Request, res: Response) {
    const { id } = input(req, 'params', userIdParams);
    return ok(res, await usersService.getPublic(id));
  },
};
