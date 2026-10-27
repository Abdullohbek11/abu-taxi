/** Toshkent vaqti: UTC+5, yozgi vaqt yo'q. */
export const TASHKENT_OFFSET_MIN = 5 * 60;

/** "2026-10-01" + "06:30" (Toshkent) → UTC Date */
export function tashkentToUtc(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TASHKENT_OFFSET_MIN * 60_000);
}

export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;
