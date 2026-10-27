import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/**
 * O'rinlar 1 dan raqamlanadi: 1 — haydovchi yonidagi old o'rin, keyingilari orqa qatorlar
 * (chapdan o'ngga). Narxlar `Trip.seatPrices` da (i-element = (i+1)-o'rin), bo'lmasa hammasi `pricePerSeat`.
 */

function intList(value: Prisma.JsonValue | null | undefined): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v)) : [];
}

/** Har bir o'rin narxi (uzunligi har doim totalSeats). */
export function seatPriceList(trip: { totalSeats: number; pricePerSeat: number; seatPrices: Prisma.JsonValue | null }): number[] {
  const list = intList(trip.seatPrices);
  return Array.from({ length: trip.totalSeats }, (_, i) => list[i] ?? trip.pricePerSeat);
}

/** Band qilishdagi o'rin raqamlari. */
export function seatNumberList(value: Prisma.JsonValue | null | undefined): number[] {
  return intList(value);
}

/** Faol band qilishlar egallagan o'rinlar (o'sish tartibida). */
export function takenSeats(bookings: { seatNumbers: Prisma.JsonValue | null }[]): number[] {
  return [...new Set(bookings.flatMap((b) => seatNumberList(b.seatNumbers)))].sort((a, b) => a - b);
}

/**
 * Yangi safar yoki tahrir uchun narxlarni tekshiradi.
 * Qaytaradi: saqlanadigan seatPrices (hammasi teng bo'lsa — null) va eng arzon narx (pricePerSeat).
 */
export function normalizeSeatPrices(totalSeats: number, seatPrices: number[] | undefined, pricePerSeat: number | undefined) {
  if (seatPrices) {
    if (seatPrices.length !== totalSeats) {
      throw new AppError('SEAT_PRICES_MISMATCH', { seatPrices: `length = ${totalSeats}` });
    }
    const min = Math.min(...seatPrices);
    return { seatPrices: seatPrices.every((p) => p === min) ? null : seatPrices, pricePerSeat: min };
  }
  if (pricePerSeat === undefined) throw new AppError('SEAT_PRICES_MISMATCH', { pricePerSeat: 'required' });
  return { seatPrices: null, pricePerSeat };
}

/**
 * So'ralgan o'rinlarni tekshiradi yoki (ko'rsatilmagan bo'lsa) eng kichik raqamli bo'sh o'rinlarni tanlaydi.
 * Chaqiruvchi safar qatorini FOR UPDATE bilan qulflagan bo'lishi kerak.
 */
export function pickSeats(totalSeats: number, taken: number[], requested: number[] | undefined, count: number): number[] {
  const busy = new Set(taken);
  if (requested) {
    for (const n of requested) {
      if (n < 1 || n > totalSeats) throw new AppError('SEAT_INVALID', { seatNumbers: `1..${totalSeats}` });
    }
    if (requested.some((n) => busy.has(n))) throw new AppError('SEAT_TAKEN');
    return [...requested].sort((a, b) => a - b);
  }
  const free = Array.from({ length: totalSeats }, (_, i) => i + 1).filter((n) => !busy.has(n));
  if (free.length < count) throw new AppError('TRIP_FULL');
  return free.slice(0, count);
}
