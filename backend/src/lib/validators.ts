import { z } from 'zod';

/**
 * Ism/familiya: faqat harflar (lotin, kirill), bo'shliq, apostrof va chiziqcha.
 * Boshqalarga ko'rsatiladi — havola, raqam yoki belgilar orqali firibgarlik (masalan "t.me/...") oldini oladi.
 */
export const personName = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2)
      .max(50)
      .regex(/^[\p{L}\p{M}][\p{L}\p{M}'ʻʼ‘’` .-]*$/u, "Faqat harflar, bo'shliq, apostrof va chiziqcha|Только буквы, пробел, апостроф и дефис"),
  );

/**
 * Xaritadagi nuqta — faqat O'zbekiston hududi (taxminiy chegaralar).
 * coerce: multipart formalarda ham ishlaydi.
 */
export const uzLat = z.coerce.number().min(37).max(45.7);
export const uzLng = z.coerce.number().min(55.9).max(73.2);

/** Kenglik va uzunlik birga yuboriladi (biri bo'lib, ikkinchisi bo'lmasligi mumkin emas). */
export const latLngPair = <T extends Record<string, unknown>>(prefix: 'pickup' | 'dropoff') => ({
  check: (b: T) => (b[`${prefix}Lat`] === undefined) === (b[`${prefix}Lng`] === undefined),
  opts: {
    path: [`${prefix}Lat`],
    message: `${prefix}Lat va ${prefix}Lng birga yuboriladi|${prefix}Lat и ${prefix}Lng передаются вместе`,
  },
});

/** Erkin matn (izoh, sharh): boshqaruv belgilarisiz. */
export const freeText = (max: number, min = 0) =>
  z
    .string()
    .trim()
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, ''))
    .pipe(z.string().min(min).max(max));
