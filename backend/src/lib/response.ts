import type { Response } from 'express';

export interface Meta {
  nextCursor?: string | null;
  [key: string]: unknown;
}

/** Muvaffaqiyatli javob: { success: true, data, meta? } */
export function ok<T>(res: Response, data: T, meta?: Meta, status = 200): Response {
  const body: { success: true; data: T; meta?: Meta } = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, undefined, 201);
}
