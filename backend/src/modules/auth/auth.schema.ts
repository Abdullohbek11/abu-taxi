import { z } from 'zod';

/** +998XXXXXXXXX. Bo'shliq, tire va qavslar olib tashlanadi; "998..." yoki "9..." ham qabul qilinadi. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .transform((v) => (v.startsWith('+') ? v : v.length === 9 ? `+998${v}` : `+${v}`))
  .pipe(z.string().regex(/^\+998\d{9}$/, "Telefon +998XXXXXXXXX formatida bo'lishi kerak|Телефон должен быть в формате +998XXXXXXXXX"));

/** Botdan olingan kirish kodi (6 belgi; bo'shliq/chiziqcha va kichik harflar qabul qilinadi). */
export const loginCodeBody = z
  .object({
    code: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
      .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/, "Kod 6 ta belgidan iborat|Код состоит из 6 символов")),
  })
  .strict();

/** Admin panelga kirish: login = admin telefon raqami. */
export const adminLoginBody = z
  .object({
    login: phoneSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const changePasswordBody = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

/** Mobil ilova cookie ishlatmaydi — refresh token body'da yuboriladi. */
export const refreshBody = z.object({ refreshToken: z.string().min(1).optional() }).strict();
