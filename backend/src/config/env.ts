import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Vergul bilan ajratilgan URL ro'yxati: "https://abutax.uz,https://admin.abutax.uz" */
const urlList = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean))
  .pipe(z.array(z.string().url()).min(1));

/** .env.example dagi namunaviy qiymatlar — production'da taqiqlanadi */
const WEAK_SECRET = /change-me|secret|password|minioadmin|^test-/i;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Qaysi manzilda eshitadi. Firewall'siz serverda proxy ortida — 127.0.0.1 (API tashqariga ochilmaydi) */
    HOST: z.string().default('0.0.0.0'),

    /** mysql://USER:PAROL@HOST:3306/DB */
    DATABASE_URL: z.string().regex(/^mysql:\/\//, 'DATABASE_URL mysql:// bilan boshlanishi kerak'),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    /** CORS va Socket.IO uchun ruxsat etilgan manbalar (bir nechta — vergul bilan) */
    FRONTEND_URL: urlList,

    /**
     * Nechta proxy ortida ishlayapti (nginx → 1). 0 — X-Forwarded-For'ga ishonilmaydi.
     * Noto'g'ri qiymat IP bo'yicha limitlarni aylanib o'tishga imkon beradi.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

    /** Refresh cookie: frontend va API turli saytlarda bo'lsa "none" (faqat HTTPS) */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),

    /** IP bo'yicha umumiy limit (daqiqasiga). Mobil operatorlar CGNAT ishlatadi — juda past qilmang */
    RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).default(300),

    /** Swagger /docs (production'da o'chirib qo'yish mumkin) */
    DOCS_ENABLED: bool.default('true'),

    /**
     * Telegram bot bilan umumiy maxfiy kalit (bot/ .env dagi BOT_API_SECRET bilan bir xil).
     * Bot ichki API'ga (/api/v1/internal/bot) faqat shu kalit bilan murojaat qiladi.
     */
    BOT_API_SECRET: z.string().min(32),
    /** Bot username'i (@ siz) — saytda "@AbuTaxBot ga kiring" ko'rsatish uchun */
    BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).default('AbuTaxBot'),

    /**
     * Safar so'rovi: shu yo'nalishdagi haydovchilar shuncha daqiqa ichida olmasa, bot uni Telegram guruhga tashlaydi.
     * Mos haydovchi topilmasa — darhol.
     */
    RIDE_REQUEST_GROUP_DELAY_MIN: z.coerce.number().int().min(0).max(1440).default(10),

    /** Bir nechta instansiyada ham yoqib qo'yish xavfsiz (MySQL JobLock qulfi) */
    CRON_ENABLED: bool.default('true'),

    /** Fayl saqlash: s3 (S3/MinIO/R2) yoki local (server diski — Docker'siz lokal ishlab chiqish) */
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
    /** local: fayllar papkasi (public/ va private/) */
    LOCAL_STORAGE_DIR: z.string().default('uploads'),
    /** local: fayl URL'lari oldiga qo'shiladigan manzil; bo'sh — nisbiy (/uploads/..., sayt bilan bir domen) */
    PUBLIC_FILES_URL: z.string().url().optional(),

    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(1).optional(),
    S3_SECRET_KEY: z.string().min(1).optional(),
    S3_BUCKET_PUBLIC: z.string().min(1).optional(),
    S3_BUCKET_PRIVATE: z.string().min(1).optional(),
    S3_PUBLIC_URL: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (v.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET_PUBLIC', 'S3_BUCKET_PRIVATE'] as const) {
        if (!v[key]) fail(key, 'STORAGE_DRIVER=s3 uchun majburiy');
      }
    }
    if (v.JWT_ACCESS_SECRET === v.JWT_REFRESH_SECRET) {
      fail('JWT_REFRESH_SECRET', "Access va refresh sirlari bir xil bo'lmasligi kerak");
    }
    if (v.COOKIE_SAMESITE === 'none' && v.NODE_ENV !== 'production') {
      // SameSite=None faqat Secure cookie bilan ishlaydi (HTTPS)
      fail('COOKIE_SAMESITE', "COOKIE_SAMESITE=none faqat production'da (HTTPS) ishlaydi");
    }

    if (v.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'S3_SECRET_KEY', 'BOT_API_SECRET'] as const) {
        const value = v[key];
        if (value && WEAK_SECRET.test(value)) fail(key, "Production'da namunaviy/kuchsiz sir ishlatilmaydi");
      }
      const db = new URL(v.DATABASE_URL);
      if (db.username === 'root' || ['', 'abutax', 'password', 'root'].includes(decodeURIComponent(db.password))) {
        fail('DATABASE_URL', "Production'da MySQL root yoki standart parol ishlatilmaydi");
      }
      if (v.FRONTEND_URL.some((u) => u.startsWith('http://'))) {
        fail('FRONTEND_URL', "Production'da FRONTEND_URL https bo'lishi kerak");
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Logger hali tayyor emas — to'g'ridan-to'g'ri stderr'ga yozamiz
  process.stderr.write(`Muhit o'zgaruvchilari noto'g'ri:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
