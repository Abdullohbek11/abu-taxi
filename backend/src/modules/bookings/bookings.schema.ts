import { z } from 'zod';
import { freeText, latLngPair, uzLat, uzLng } from '../../lib/validators.js';
import { cursorQuery } from '../../lib/pagination.js';

export const bookingIdParams = z.object({ id: z.string().min(1).max(40) });

export const createBookingBody = z
  .object({
    tripId: z.string().min(1).max(40),
    /** seatNumbers berilsa ixtiyoriy (uzunligiga teng bo'lishi kerak) */
    seats: z.number().int().min(1).max(8).optional(),
    /** Tanlangan o'rinlar (1 — old o'rin). Berilmasa bo'sh o'rinlar avtomatik tanlanadi */
    seatNumbers: z
      .array(z.number().int().min(1).max(8))
      .min(1)
      .max(8)
      .refine((a) => new Set(a).size === a.length, "O'rinlar takrorlanmasligi kerak|Места не должны повторяться")
      .optional(),
    pickupAddress: freeText(300, 3).optional(),
    pickupLat: uzLat.optional(),
    pickupLng: uzLng.optional(),
    /** Qayerga tushirish (ixtiyoriy) */
    dropoffAddress: freeText(300, 3).optional(),
    dropoffLat: uzLat.optional(),
    dropoffLng: uzLng.optional(),
    comment: freeText(500).optional(),
  })
  .strict()
  .refine((b) => b.seats !== undefined || b.seatNumbers !== undefined, {
    path: ['seats'],
    message: "O'rinlar sonini yoki o'rinlarni tanlang|Укажите количество мест или выберите места",
  })
  .refine((b) => b.seats === undefined || b.seatNumbers === undefined || b.seats === b.seatNumbers.length, {
    path: ['seats'],
    message: "seats tanlangan o'rinlar soniga teng bo'lishi kerak|seats должно совпадать с количеством выбранных мест",
  })
  .refine(latLngPair('pickup').check, latLngPair('pickup').opts)
  .refine(latLngPair('dropoff').check, latLngPair('dropoff').opts);

export const myBookingsQuery = cursorQuery.extend({
  status: z.enum(['active', 'past']).default('active'),
});

export type CreateBookingBody = z.infer<typeof createBookingBody>;
