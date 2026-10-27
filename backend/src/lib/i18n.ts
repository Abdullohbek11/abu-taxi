import type { Request } from 'express';
import type { ZodIssue } from 'zod';

export type Locale = 'uz' | 'ru';
export const DEFAULT_LOCALE: Locale = 'uz';

/** Accept-Language sarlavhasidan tilni aniqlaydi: "ru-RU,ru;q=0.9" → ru. */
export function resolveLocale(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const langs = header
    .split(',')
    .map((part) => {
      const [tag = '', q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of langs) {
    if (tag.startsWith('ru')) return 'ru';
    if (tag.startsWith('uz')) return 'uz';
  }
  return DEFAULT_LOCALE;
}

export function localeOf(req: Request): Locale {
  return resolveLocale(req.headers['accept-language']);
}

/** Zod validatsiya xatolarini foydalanuvchi tilidagi qisqa xabarga aylantiradi. */
export function zodIssueMessage(issue: ZodIssue, locale: Locale): string {
  const uz = locale === 'uz';
  // Sxemada maxsus xabar "uz|ru" ko'rinishida berilgan bo'lsa — o'shani ishlatamiz
  if (issue.message.includes('|')) {
    const [u, r] = issue.message.split('|');
    return (uz ? u : r) ?? issue.message;
  }
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') return uz ? 'Majburiy maydon' : 'Обязательное поле';
      return uz ? "Noto'g'ri tur" : 'Неверный тип';
    case 'too_small':
      if (issue.type === 'string') return uz ? `Kamida ${issue.minimum} ta belgi` : `Минимум ${issue.minimum} символов`;
      if (issue.type === 'array') return uz ? `Kamida ${issue.minimum} ta element` : `Минимум ${issue.minimum} элементов`;
      return uz ? `Kamida ${issue.minimum}` : `Минимум ${issue.minimum}`;
    case 'too_big':
      if (issue.type === 'string') return uz ? `Ko'pi bilan ${issue.maximum} ta belgi` : `Максимум ${issue.maximum} символов`;
      if (issue.type === 'array') return uz ? `Ko'pi bilan ${issue.maximum} ta element` : `Максимум ${issue.maximum} элементов`;
      return uz ? `Ko'pi bilan ${issue.maximum}` : `Максимум ${issue.maximum}`;
    case 'invalid_enum_value':
      return uz ? `Ruxsat etilgan qiymatlar: ${issue.options.join(', ')}` : `Допустимые значения: ${issue.options.join(', ')}`;
    case 'invalid_string':
      return uz ? "Noto'g'ri format" : 'Неверный формат';
    case 'invalid_date':
      return uz ? "Noto'g'ri sana" : 'Неверная дата';
    case 'unrecognized_keys':
      return uz ? `Noma'lum maydonlar: ${issue.keys.join(', ')}` : `Неизвестные поля: ${issue.keys.join(', ')}`;
    case 'custom':
      return issue.message;
    default:
      return uz ? "Noto'g'ri qiymat" : 'Неверное значение';
  }
}
