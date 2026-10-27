import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { AppError } from './errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/**
 * "Dekompressiya bombasi"ga qarshi: 5MB PNG 20000×20000 piksel bo'lishi va gigabaytlab xotira
 * egallashi mumkin. 40 MP (masalan 8000×5000) — telefon kamerasi uchun yetarli.
 */
const MAX_INPUT_PIXELS = 40_000_000;
const SHARP_OPTS = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const, animated: false };

// Parallel og'ir operatsiyalar sonini cheklash (bitta so'rov butun CPU'ni band qilmasligi uchun)
sharp.concurrency(2);

/**
 * Rasmni tekshiradi va 1600px gacha kichraytirib WEBP'ga o'tkazadi.
 * MIME sarlavhasiga ishonilmaydi — haqiqiy format sharp orqali aniqlanadi.
 */
export async function processImage(input: Buffer): Promise<Buffer> {
  let meta: Metadata;
  try {
    // metadata() faqat sarlavhani o'qiydi (piksellar ochilmaydi) — o'lchamni o'zimiz tekshiramiz
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new AppError('FILE_TYPE_NOT_ALLOWED');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new AppError('FILE_TYPE_NOT_ALLOWED');
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) throw new AppError('IMAGE_TOO_LARGE');

  return sharp(input, SHARP_OPTS)
    .rotate() // EXIF bo'yicha to'g'rilash (EXIF o'zi olib tashlanadi)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export const imageKey = (prefix: string) => `${prefix}/${randomUUID()}.webp`;
