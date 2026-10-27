/**
 * Telegram kontaktidagi raqamni +998XXXXXXXXX ko'rinishiga keltiradi.
 * Telegram ba'zan "998901234567", ba'zan "+998901234567" yuboradi.
 * O'zbekiston raqami bo'lmasa — null (platforma faqat O'zbekiston uchun).
 */
export function normalizeUzPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const full = digits.length === 9 ? `998${digits}` : digits;
  return /^998\d{9}$/.test(full) ? `+${full}` : null;
}
