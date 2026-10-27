import { z } from 'zod';
import { personName } from '../../lib/validators.js';

/**
 * Telefon va telegramUsername bu yerda o'zgartirilmaydi: ular kontakt sifatida boshqalarga ko'rsatiladi,
 * shuning uchun faqat bot orqali (Telegram kontakti va profili bilan tasdiqlangan holda) o'rnatiladi.
 */
export const updateMeBody = z
  .object({
    firstName: personName.optional(),
    lastName: personName.optional(),
    lang: z.enum(['UZ', 'RU']).optional(),
  })
  .strict();

export const setRoleBody = z.object({ role: z.enum(['PASSENGER', 'SENDER', 'DRIVER']) }).strict();

export const userIdParams = z.object({ id: z.string().min(1).max(40) });
