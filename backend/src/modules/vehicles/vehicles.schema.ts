import { z } from 'zod';
import { freeText } from '../../lib/validators.js';

/** "01a777ba" → "01 A 777 BA"; bo'shliqlar normallashtiriladi, katta harf. */
const plateNumber = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/\s+/g, ' '))
  .pipe(z.string().regex(/^\d{2} ?[A-Z] ?\d{3} ?[A-Z]{2}$|^\d{2} ?\d{3} ?[A-Z]{3}$/, "Davlat raqami formati: 01 A 777 BA|Формат госномера: 01 A 777 BA"))
  .transform((v) => {
    const s = v.replace(/ /g, '');
    return /^\d{2}[A-Z]/.test(s)
      ? `${s.slice(0, 2)} ${s.slice(2, 3)} ${s.slice(3, 6)} ${s.slice(6)}`
      : `${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5)}`;
  });

export const createVehicleBody = z
  .object({
    model: freeText(50, 2),
    color: freeText(30, 2),
    plateNumber,
    seats: z.number().int().min(1).max(8),
    acceptsCargo: z.boolean().default(false),
  })
  .strict();

export const updateVehicleBody = createVehicleBody.partial().strict();

export const vehicleIdParams = z.object({ id: z.string().min(1).max(40) });

export const photoParams = vehicleIdParams.extend({ index: z.coerce.number().int().min(0).max(20) });
