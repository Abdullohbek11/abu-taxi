import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** validate() middleware tomonidan tekshirilgan kirishlar */
      valid?: Record<string, unknown>;
      /** auth middleware tomonidan o'rnatiladi */
      user?: { id: string; role: Role | null };
    }
  }
}

export {};
