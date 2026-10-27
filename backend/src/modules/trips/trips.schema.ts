import { z } from 'zod';
import { freeText } from '../../lib/validators.js';
import { cursorQuery } from '../../lib/pagination.js';

const id = z.string().min(1).max(40);
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt formati HH:mm|Формат времени HH:mm');
const price = z.number().int().min(10_000).max(2_000_000);

export const tripIdParams = z.object({ id });

export const searchTripsQuery = cursorQuery
  .extend({
    from: id,
    to: id,
    /** Toshkent vaqti bo'yicha sana: YYYY-MM-DD */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati YYYY-MM-DD|Формат даты YYYY-MM-DD').optional(),
    seats: z.coerce.number().int().min(1).max(8).default(1),
    timeFrom: time.optional(),
    timeTo: time.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    pickupFromHome: bool.optional(),
    acceptsCargo: bool.optional(),
    /** false (standart): viloyatdagi barcha tumanlar ham qidiriladi */
    exactCity: bool.default('false'),
    sort: z.enum(['time', 'price', 'rating']).default('time'),
  })
  .refine((q) => !(q.timeFrom || q.timeTo) || q.date, {
    path: ['date'],
    message: "Vaqt oralig'i uchun sana kerak|Для интервала времени нужна дата",
  });

/** Har bir o'rin narxi: i-element = (i+1)-o'rin (1 — old o'rin) */
const seatPrices = z.array(price).min(1).max(8);

export const createTripBody = z
  .object({
    vehicleId: id,
    fromCityId: id,
    toCityId: id,
    departureAt: z.coerce.date(),
    totalSeats: z.number().int().min(1).max(8).optional(),
    /** Hamma o'rin bir xil narxda bo'lsa; seatPrices berilsa — eng arzoni avtomatik olinadi */
    pricePerSeat: price.optional(),
    seatPrices: seatPrices.optional(),
    pickupFromHome: z.boolean().default(false),
    acceptsCargo: z.boolean().default(false),
    note: freeText(500).optional(),
  })
  .strict()
  .refine((b) => b.pricePerSeat !== undefined || b.seatPrices !== undefined, {
    path: ['pricePerSeat'],
    message: "Narx ko'rsatilishi kerak|Нужно указать цену",
  });

export const updateTripBody = z
  .object({
    departureAt: z.coerce.date(),
    totalSeats: z.number().int().min(1).max(8),
    pricePerSeat: price,
    seatPrices,
    pickupFromHome: z.boolean(),
    acceptsCargo: z.boolean(),
    note: freeText(500).nullable(),
  })
  .partial()
  .strict();

export const myTripsQuery = cursorQuery.extend({
  status: z.enum(['active', 'completed', 'cancelled']).default('active'),
});

export type SearchTripsQuery = z.infer<typeof searchTripsQuery>;
export type CreateTripBody = z.infer<typeof createTripBody>;
export type UpdateTripBody = z.infer<typeof updateTripBody>;
