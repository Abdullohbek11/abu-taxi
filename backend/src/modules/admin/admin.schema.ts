import { z } from 'zod';
import { freeText } from '../../lib/validators.js';
import { cursorQuery } from '../../lib/pagination.js';

export const idParams = z.object({ id: z.string().min(1).max(40) });

export const listDriversQuery = cursorQuery.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
});

/** Bloklash sababi (ixtiyoriy) — foydalanuvchiga va admin ro'yxatida ko'rsatiladi. */
export const blockBody = z.object({ reason: freeText(500).optional() }).strict();

export const rejectBody = z.object({ reason: freeText(500, 3) }).strict();

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listUsersQuery = cursorQuery.extend({
  q: z.string().trim().min(2).max(50).optional(),
  role: z.enum(['PASSENGER', 'SENDER', 'DRIVER', 'ADMIN']).optional(),
  blocked: boolQuery.optional(),
});

export const listAuditQuery = cursorQuery.extend({
  targetType: z.enum(['driver', 'vehicle', 'document', 'user', 'rideRequest', 'review', 'export']).optional(),
  targetId: z.string().min(1).max(40).optional(),
});

/** Admin ro'yxatlari: holat (har jadvalning o'z holatlari) va qidiruv (telefon, ism, davlat raqami). */
export const adminListQuery = cursorQuery.extend({
  status: z.string().regex(/^[A-Z_]{2,20}$/).optional(),
  q: z.string().trim().min(2).max(50).optional(),
});

export const exportParams = z.object({ entity: z.enum(['users', 'trips', 'bookings', 'cargo', 'ride-requests']) });

export type AdminListQuery = z.infer<typeof adminListQuery>;
export type ExportEntity = z.infer<typeof exportParams>['entity'];
