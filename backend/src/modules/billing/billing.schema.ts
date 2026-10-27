import { z } from 'zod';
import { cursorQuery } from '../../lib/pagination.js';
import { freeText } from '../../lib/validators.js';

/** Admin sozlamalari: tarif narxi, muddati va to'lov rekvizitlari. */
export const billingSettingsBody = z
  .object({
    enabled: z.boolean(),
    price: z.number().int().min(1000).max(10_000_000),
    days: z.number().int().min(1).max(365),
    /** Yangi tasdiqlangan haydovchiga bepul sinov kunlari (0 — yo'q) */
    trialDays: z.number().int().min(0).max(90),
    /** Karta raqami: 16 raqam (bo'shliqlar olib tashlanadi) yoki bo'sh */
    cardNumber: z
      .string()
      .transform((v) => v.replace(/\s/g, ''))
      .pipe(z.string().regex(/^(\d{16})?$/, "Karta raqami 16 ta raqam|Номер карты — 16 цифр")),
    cardHolder: freeText(64),
    /** Chek yuboriladigan Telegram (@ siz) */
    telegramUsername: z
      .string()
      .transform((v) => v.trim().replace(/^@/, ''))
      .pipe(z.string().regex(/^([A-Za-z0-9_]{4,32})?$/, "Telegram username noto'g'ri|Неверный Telegram username")),
    paymeMerchantId: z.string().trim().regex(/^([a-f0-9]{24})?$/i, "Payme merchant ID 24 belgi|Payme merchant ID — 24 символа"),
    clickServiceId: z.string().trim().regex(/^(\d{1,10})?$/),
    clickMerchantId: z.string().trim().regex(/^(\d{1,10})?$/),
  })
  .strict();

/** Haydovchi: kartaga to'lagani haqida (chek rasmi multipart `file` sifatida, ixtiyoriy). */
export const cardPaymentBody = z.object({ note: freeText(500).optional() }).strict();

export const onlinePaymentBody = z.object({ provider: z.enum(['payme', 'click']) }).strict();

export const paymentIdParams = z.object({ id: z.string().min(1).max(40) });

export const adminPaymentsQuery = cursorQuery.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
});

export const rejectPaymentBody = z.object({ reason: freeText(500, 3) }).strict();

/** Admin qo'lda obuna beradi (masalan, chek Telegram'da kelgan bo'lsa). */
export const grantSubscriptionBody = z
  .object({
    days: z.number().int().min(1).max(365),
    amount: z.number().int().min(0).max(10_000_000).optional(),
    note: freeText(500).optional(),
  })
  .strict();

export type BillingSettings = z.infer<typeof billingSettingsBody>;
