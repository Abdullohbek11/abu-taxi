import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { AppError, errorMessage, type ErrorCode, type FieldErrors } from '../lib/errors.js';
import { localeOf, zodIssueMessage } from '../lib/i18n.js';
import { isDeadlock } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('ROUTE_NOT_FOUND'));
}

function normalize(err: unknown, req: Request): { error: AppError; fields?: FieldErrors } {
  if (err instanceof AppError) return { error: err, fields: err.fields };

  if (err instanceof ZodError) {
    const locale = localeOf(req);
    const fields: FieldErrors = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || '_';
      fields[path] ??= zodIssueMessage(issue, locale);
    }
    return { error: new AppError('VALIDATION_ERROR'), fields };
  }

  // Qayta urinishlardan keyin ham qolgan deadlock — vaqtinchalik holat: 500 emas, 503 + Retry-After
  if (isDeadlock(err)) return { error: new AppError('TRY_AGAIN') };

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { error: new AppError('CONFLICT') };
    if (err.code === 'P2025') return { error: new AppError('NOT_FOUND') };
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return { error: new AppError('FILE_TOO_LARGE') };
    return { error: new AppError('VALIDATION_ERROR'), fields: { [err.field ?? 'file']: err.code } };
  }

  // body-parser: noto'g'ri JSON yoki juda katta body
  const e = err as { type?: string; status?: number; statusCode?: number };
  // serve-static (lokal fayllar): topilmadi / taqiqlangan
  const httpStatus = e?.status ?? e?.statusCode;
  if (httpStatus === 404) return { error: new AppError('NOT_FOUND') };
  if (httpStatus === 403) return { error: new AppError('FORBIDDEN') };
  if (e?.type === 'entity.parse.failed') return { error: new AppError('VALIDATION_ERROR'), fields: { _: 'Invalid JSON' } };
  if (e?.type === 'entity.too.large') return { error: new AppError('FILE_TOO_LARGE') };

  return { error: new AppError('INTERNAL') };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const { error, fields } = normalize(err, req);
  const code: ErrorCode = error.code;

  if (error.status >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Kutilmagan xato');
  }

  const body: Record<string, unknown> = {
    code,
    message: errorMessage(code, localeOf(req)),
  };
  if (fields && Object.keys(fields).length) body.fields = fields;
  if (!isProd && error.status >= 500 && err instanceof Error) body.stack = err.stack;

  if (error.retryAfter) res.setHeader('Retry-After', String(Math.ceil(error.retryAfter)));
  else if (code === 'TRY_AGAIN') res.setHeader('Retry-After', '1');
  res.status(error.status).json({ success: false, error: body });
}
