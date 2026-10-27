import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../lib/images.js';
import { rateLimit } from './rateLimit.js';

const uploader = (maxFiles: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: maxFiles, fields: 20, fieldSize: 10 * 1024, parts: maxFiles + 20 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) cb(null, true);
      else cb(new AppError('FILE_TYPE_NOT_ALLOWED'));
    },
  });

/** Rasm yuklash CPU/xotira talab qiladi — foydalanuvchi bo'yicha soatiga 30 ta so'rov. */
export const uploadLimit = rateLimit({ name: 'upload', limit: 30, windowSec: 3600, by: 'user' });

/** Bitta rasm: `file` maydoni. */
export const uploadImage = uploader(1).single('file');

/** Bir nechta rasm: `photos` maydoni. */
export const uploadImages = (max: number) => uploader(max).array('photos', max);

export function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new AppError('FILE_REQUIRED');
  return file;
}
