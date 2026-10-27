import { z } from 'zod';
import { phoneSchema } from '../auth/auth.schema.js';

/** Bot Telegram'dan olgan ma'lumot (kontakt va profil Telegram tomonidan tasdiqlangan). */
export const loginCodeRequestBody = z
  .object({
    telegramId: z.string().regex(/^\d{1,20}$/),
    /** Faqat kontakt tugmasi orqali, user_id mos kelgan holda bot yuboradi */
    phone: phoneSchema.optional(),
    firstName: z.string().max(64).optional(),
    lastName: z.string().max(64).optional(),
    /** Telegram username — g'ayrioddiy bo'lsa kirish to'xtamaydi, shunchaki saqlanmaydi (service'da) */
    username: z.string().max(64).optional(),
    languageCode: z.string().max(10).optional(),
  })
  .strict();

export const pendingNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ackNotificationsBody = z.object({ ids: z.array(z.string().min(1).max(40)).max(100) }).strict();

export type LoginCodeRequest = z.infer<typeof loginCodeRequestBody>;
