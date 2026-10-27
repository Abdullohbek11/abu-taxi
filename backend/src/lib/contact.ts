/**
 * Kontakt (telefon, Telegram) faqat kelishuv tasdiqlangandan keyin ochiladi:
 * band qilish CONFIRMED/COMPLETED yoki yuk taklifi ACCEPTED bo'lganda.
 */
export interface Contact {
  phone: string | null;
  telegramUsername: string | null;
}

export function toContact(user: { phone: string | null; telegramUsername: string | null }): Contact {
  return { phone: user.phone, telegramUsername: user.telegramUsername };
}

export const CONTACT_BOOKING_STATUSES = new Set(['CONFIRMED', 'COMPLETED']);
