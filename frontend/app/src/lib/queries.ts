import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { City } from './types';

/** Shaharlar deyarli o'zgarmaydi — bir marta yuklanadi */
export function useCities() {
  return useQuery({ queryKey: ['cities'], queryFn: () => api.get<City[]>('/cities'), staleTime: Infinity });
}

/** Viloyat markazlari — ro'yxatda birinchi turadi */
const REGION_CENTERS = new Set(['Toshkent', 'Nurafshon', 'Andijon', 'Buxoro', "Farg'ona", 'Jizzax', 'Namangan', 'Navoiy', 'Qarshi', 'Nukus', 'Samarqand', 'Guliston', 'Termiz', 'Urganch']);

/** Shaharlarni viloyat bo'yicha guruhlash (select optgroup uchun); Toshkent shahri birinchi */
export function groupByRegion(cities: City[]): [string, City[]][] {
  const map = new Map<string, City[]>();
  for (const c of cities) map.set(c.region, [...(map.get(c.region) ?? []), c]);
  const rank = (c: City) => (REGION_CENTERS.has(c.nameUz) ? 0 : 1);
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'Toshkent shahri' ? -1 : b === 'Toshkent shahri' ? 1 : a.localeCompare(b)))
    .map(([r, list]) => [r, [...list].sort((a, b) => rank(a) - rank(b) || a.nameUz.localeCompare(b.nameUz))]);
}

/** Hudud (viloyat) markazi — yo'nalish shu shahar orqali tanlanadi, qidiruv butun hududni qamraydi */
export interface RegionOption {
  region: string;
  center: City;
}

/** 14 hudud: Toshkent shahri birinchi, qolganlari alifbo bo'yicha */
export function regionOptions(cities: City[] | undefined): RegionOption[] {
  return groupByRegion(cities ?? [])
    .map(([region, list]) => ({ region, center: list.find((c) => REGION_CENTERS.has(c.nameUz)) ?? list[0]! }))
    .filter((r) => !!r.center);
}

/** Hudud markazlarining taxminiy koordinatalari — xaritani shu nuqtadan ochish uchun */
export const CENTER_COORDS: Record<string, [number, number]> = {
  Toshkent: [41.2995, 69.2401],
  Nurafshon: [41.0167, 69.35],
  Guliston: [40.4897, 68.7842],
  Jizzax: [40.1158, 67.8422],
  Samarqand: [39.6542, 66.9597],
  "Farg'ona": [40.3864, 71.7864],
  Namangan: [40.9983, 71.6726],
  Andijon: [40.7821, 72.3442],
  Qarshi: [38.8606, 65.7891],
  Termiz: [37.2242, 67.2783],
  Buxoro: [39.7681, 64.4556],
  Navoiy: [40.0844, 65.3792],
  Urganch: [41.55, 60.6333],
  Nukus: [42.46, 59.61],
};

/** Shahar uchun xarita markazi: hudud markazi koordinatasi (bo'lmasa — Toshkent) */
export function regionCenterCoords(cities: City[] | undefined, cityId: string | undefined): [number, number] | undefined {
  const city = cities?.find((c) => c.id === cityId);
  if (!city) return undefined;
  const center = regionOptions(cities).find((r) => r.region === city.region)?.center;
  return center ? CENTER_COORDS[center.nameUz] : undefined;
}

