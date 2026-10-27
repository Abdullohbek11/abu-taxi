import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };

/**
 * Kirishlarni zod bilan tekshiradi. Tekshirilgan qiymatlar req.valid ichiga yoziladi
 * (Express 5'da req.query faqat o'qish uchun).
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: Record<string, unknown> = {};
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (schema) valid[key] = schema.parse(req[key] ?? {});
    }
    req.valid = valid;
    next();
  };
}

/** Controller ichida tiplangan qiymatni olish. */
export function input<S extends ZodTypeAny>(req: Request, key: keyof Schemas, _schema: S): z.infer<S> {
  return req.valid?.[key] as z.infer<S>;
}
