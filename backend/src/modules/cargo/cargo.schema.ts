import { z } from 'zod';
import { freeText, latLngPair, uzLat, uzLng } from '../../lib/validators.js';
import { cursorQuery } from '../../lib/pagination.js';

const id = z.string().min(1).max(40);
const dim = z.coerce.number().int().min(1).max(1500);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati YYYY-MM-DD|Формат даты YYYY-MM-DD');

export const cargoIdParams = z.object({ id });

/** multipart (rasmlar bilan) yoki JSON — raqamlar coerce qilinadi. */
export const createCargoBody = z
  .object({
    type: z.enum(['FURNITURE', 'APPLIANCE', 'FOOD', 'CONSTRUCTION', 'OTHER']),
    weightKg: z.coerce.number().int().min(1).max(5000),
    lengthCm: dim.optional(),
    widthCm: dim.optional(),
    heightCm: dim.optional(),
    fromCityId: id,
    toCityId: id,
    pickupAddress: freeText(300, 3),
    pickupLat: uzLat.optional(),
    pickupLng: uzLng.optional(),
    dropoffAddress: freeText(300, 3),
    dropoffLat: uzLat.optional(),
    dropoffLng: uzLng.optional(),
    /** Toshkent vaqti bo'yicha sana */
    date: day,
    offeredPrice: z.coerce.number().int().min(10_000).max(20_000_000).optional(),
    description: freeText(1000).optional(),
  })
  .strict()
  .refine(latLngPair('pickup').check, latLngPair('pickup').opts)
  .refine(latLngPair('dropoff').check, latLngPair('dropoff').opts);

export const openCargoQuery = cursorQuery.extend({
  from: id.optional(),
  to: id.optional(),
  date: day.optional(),
  type: z.enum(['FURNITURE', 'APPLIANCE', 'FOOD', 'CONSTRUCTION', 'OTHER']).optional(),
  maxWeightKg: z.coerce.number().int().min(1).optional(),
});

export const myCargoQuery = cursorQuery.extend({
  status: z.enum(['active', 'past']).default('active'),
});

export const createOfferBody = z
  .object({
    price: z.number().int().min(10_000).max(20_000_000),
    message: freeText(500).optional(),
    tripId: id.optional(),
  })
  .strict();

export const myOffersQuery = cursorQuery.extend({ status: z.enum(['active', 'past']).default('active') });

export const offerIdParams = z.object({ id });

export const cargoStatusBody = z.object({ status: z.enum(['IN_TRANSIT', 'DELIVERED']) }).strict();

export type CreateCargoBody = z.infer<typeof createCargoBody>;
export type OpenCargoQuery = z.infer<typeof openCargoQuery>;
