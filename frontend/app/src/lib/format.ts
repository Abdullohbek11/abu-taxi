import type { Lang } from './i18n';
import type { City } from './types';

const TZ = 'Asia/Tashkent';

/** 150000 → "150 000" */
export function money(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}

const REGION_RU: Record<string, string> = {
  'Toshkent shahri': 'город Ташкент',
  'Toshkent viloyati': 'Ташкентская область',
  'Andijon viloyati': 'Андижанская область',
  'Buxoro viloyati': 'Бухарская область',
  "Farg'ona viloyati": 'Ферганская область',
  'Jizzax viloyati': 'Джизакская область',
  'Namangan viloyati': 'Наманганская область',
  'Navoiy viloyati': 'Навоийская область',
  'Qashqadaryo viloyati': 'Кашкадарьинская область',
  "Qoraqalpog'iston Respublikasi": 'Республика Каракалпакстан',
  'Samarqand viloyati': 'Самаркандская область',
  'Sirdaryo viloyati': 'Сырдарьинская область',
  'Surxondaryo viloyati': 'Сурхандарьинская область',
  'Xorazm viloyati': 'Хорезмская область',
};

/** Viloyat nomi (bazada o'zbekcha saqlanadi) */
export function regionName(region: string, lang: Lang): string {
  return lang === 'RU' ? (REGION_RU[region] ?? region) : region;
}

export function cityName(c: Pick<City, 'nameUz' | 'nameRu'> | null | undefined, lang: Lang): string {
  if (!c) return '';
  return lang === 'RU' ? c.nameRu : c.nameUz;
}

/** Toshkent vaqti: "06:30" */
export function time(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Toshkent bo'yicha sana kaliti: "2026-10-02" */
export function tashkentDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];

export function monthName(month: number, lang: Lang): string {
  return lang === 'RU' ? new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, 15))) : UZ_MONTHS[month]!;
}

/** Hafta kuni qisqa nomi (brauzerlar o'zbekchani to'liq bilmaydi — "Fri" o'rniga "Juma") */
export function weekdayShort(dateKey: string, lang: Lang): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return lang === 'RU' ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(d) : UZ_DAYS[d.getUTCDay()]!;
}

/** "Ertaga, 2-oktabr, Pay" / "Завтра, 2 окт., чт" */
export function dayLabel(dateKey: string, lang: Lang, t: (k: 'common.today' | 'common.tomorrow') => string): string {
  const today = tashkentDateKey();
  const prefix = dateKey === today ? t('common.today') : dateKey === addDays(today, 1) ? t('common.tomorrow') : '';
  const d = new Date(`${dateKey}T12:00:00Z`);
  let body: string;
  if (lang === 'RU') {
    body = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' }).format(d);
  } else {
    body = `${d.getUTCDate()}-${UZ_MONTHS[d.getUTCMonth()]}, ${UZ_DAYS[d.getUTCDay()]}`;
  }
  return prefix ? `${prefix}, ${body}` : body;
}

/** ISO sana-vaqt → Toshkent bo'yicha "Ertaga, 2-oktabr · 06:30" */
export function departure(iso: string, lang: Lang, t: (k: 'common.today' | 'common.tomorrow') => string): string {
  return `${dayLabel(tashkentDateKey(new Date(iso)), lang, t)} · ${time(iso)}`;
}

/** Toshkent sanasi + vaqti → ISO (UTC) */
export function tashkentToIso(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00+05:00`).toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** +998901234567 → +998 (90) 123-45-67 */
export function phoneDisplay(p: string | null): string {
  if (!p) return '';
  const m = p.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+998 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : p;
}

/** "5 daqiqa oldin" / "5 минут назад". Brauzerlarda o'zbekcha Intl.RelativeTimeFormat to'liq emas ("-2 h") — UZ qo'lda. */
export function relativeTime(iso: string, lang: Lang): string {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === 'UZ') {
    if (diff < 60) return 'hozirgina';
    if (diff < 3600) return `${Math.round(diff / 60)} daqiqa oldin`;
    if (diff < 86400) return `${Math.round(diff / 3600)} soat oldin`;
    if (diff < 86400 * 30) return `${Math.round(diff / 86400)} kun oldin`;
    const d = new Date(iso);
    return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;
  }
  const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}
