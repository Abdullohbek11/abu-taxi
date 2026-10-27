import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination.js';
import { freeText, personName } from '../../lib/validators.js';
import { phoneSchema } from '../auth/auth.schema.js';

const id = z.string().min(1).max(40);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati YYYY-MM-DD|Формат даты YYYY-MM-DD');
const price = z.coerce.number().int().min(10_000).max(5_000_000);

export const rideRequestIdParams = z.object({ id });

/** Safar topilmaganda yo'lovchi qoldiradigan so'rov. */
export const createRideRequestBody = z
  .object({
    fromCityId: id,
    toCityId: id,
    /** Toshkent vaqti bo'yicha sana */
    date: day,
    seats: z.coerce.number().int().min(1).max(8),
    /** Taklif qilingan narx, kishi boshiga (ixtiyoriy) */
    offeredPrice: price.optional(),
    note: freeText(500).optional(),
  })
  .strict();

export const myRideRequestsQuery = cursorQuery.extend({
  status: z.enum(['active', 'past']).default('active'),
});

export const openRideRequestsQuery = cursorQuery.extend({
  from: id.optional(),
  to: id.optional(),
  date: day.optional(),
});

/** Haydovchi so'rovni oladi: narx kishi boshiga. */
export const takeRideRequestBody = z
  .object({
    pricePerSeat: price,
    vehicleId: id.optional(),
  })
  .strict();

/** Admin tizimda yo'q haydovchini qo'lda biriktiradi. */
export const assignRideRequestBody = z
  .object({
    driverName: personName,
    driverPhone: phoneSchema,
    carModel: freeText(100, 2),
    carColor: freeText(50).optional(),
    carPlate: freeText(20).optional(),
    pricePerSeat: price,
  })
  .strict();

export const adminRideRequestsQuery = cursorQuery.extend({
  status: z.enum(['OPEN', 'ASSIGNED', 'CANCELLED', 'EXPIRED']).optional(),
});

// ── Bot (ichki API) ──

export const botTelegramBody = z.object({ telegramId: z.string().regex(/^\d{1,20}$/) }).strict();

export const botTakeBody = z
  .object({
    telegramId: z.string().regex(/^\d{1,20}$/),
    pricePerSeat: price,
  })
  .strict();

export const botGroupPostedBody = z
  .object({
    chatId: z.string().regex(/^-?\d{1,20}$/),
    messageId: z.number().int().positive(),
  })
  .strict();

export type CreateRideRequestBody = z.infer<typeof createRideRequestBody>;
export type OpenRideRequestsQuery = z.infer<typeof openRideRequestsQuery>;
export type AssignRideRequestBody = z.infer<typeof assignRideRequestBody>;
