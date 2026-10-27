import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** @BotFather bergan token */
    BOT_TOKEN: z.string().regex(/^\d+:[\w-]{30,}$/, 'BOT_TOKEN formati: 123456:ABC...'),
    /** Backend ichki API manzili, masalan http://api:4000/api/v1 */
    API_URL: z.string().url(),
    /** Backend bilan umumiy maxfiy kalit (backend .env dagi BOT_API_SECRET bilan bir xil) */
    BOT_API_SECRET: z.string().min(32),
    /** Sayt manzili — "Saytga o'tish" tugmasi uchun (faqat https bo'lsa ko'rsatiladi) */
    WEB_URL: z.string().url(),
    /** Muhim hodisalarni Telegram orqali yuborish (bildirishnomalar navbati) */
    TELEGRAM_NOTIFY: bool.default('true'),
    NOTIFY_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    /**
     * Safar so'rovlari tashlanadigan Telegram guruh/kanal ID'si (masalan -1001234567890).
     * Botni guruhga qo'shing va guruhda /chatid yozing. Bo'sh — guruhga tashlanmaydi.
     */
    GROUP_CHAT_ID: z
      .string()
      .regex(/^-?\d{5,20}$/, 'GROUP_CHAT_ID: guruh ID raqami, masalan -1001234567890')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    GROUP_POLL_MS: z.coerce.number().int().min(2000).default(15000),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && /change-me|secret|^test-/i.test(v.BOT_API_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['BOT_API_SECRET'], message: "Production'da namunaviy sir ishlatilmaydi" });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Bot muhit o'zgaruvchilari noto'g'ri:\n${issues}`);
  }
  return parsed.data;
}
