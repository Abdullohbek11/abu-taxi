import type { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!req.user) throw new AppError('UNAUTHORIZED');
    if (!role) throw new AppError('ROLE_REQUIRED');
    if (!roles.includes(role)) throw new AppError('FORBIDDEN');
    next();
  };
}

/** Rol tanlangan bo'lishi shart (har qanday). */
export function requireAnyRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new AppError('UNAUTHORIZED');
  if (!req.user.role) throw new AppError('ROLE_REQUIRED');
  next();
}
