/** "Bahodir", "Aliyev" → "Bahodir A." (ommaviy profil uchun familiya to'liq ko'rsatilmaydi) */
export function displayName(firstName: string | null, lastName: string | null): string {
  const first = firstName?.trim() || 'Foydalanuvchi';
  const initial = lastName?.trim()?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

/** "01 A 777 BA" → "01 A 7**" (frontend namunasidagidek) */
export function maskPlate(plate: string): string {
  const parts = plate.trim().split(/\s+/);
  if (parts.length < 3) return `${plate.slice(0, 3)}***`;
  const [region, letter, digits = ''] = parts;
  return `${region} ${letter} ${digits.slice(0, 1)}**`;
}

/** JSON ustunidagi rasm URL'lari (MySQL'da `Json?`) → string[]; null yoki noto'g'ri qiymat → []. */
export function photoList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Mashina obyektini API ko'rinishiga keltiradi (photos har doim massiv). */
export function withPhotos<T extends { photos: unknown }>(row: T): Omit<T, 'photos'> & { photos: string[] } {
  return { ...row, photos: photoList(row.photos) };
}
