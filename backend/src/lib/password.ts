import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Admin paroli: scrypt (xotiraga og'ir — GPU bilan taxmin qilish qimmat), har parolga alohida tuz.
 * Saqlash formati: `scrypt$N$r$p$<tuz base64>$<hash base64>` — parametrlar keyin oshirilsa ham eski hashlar tekshiriladi.
 */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions & { keylen: number }): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p, maxmem: opts.maxmem }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r: R, p: P, keylen: KEYLEN, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Foydalanuvchi topilmaganda ham shuncha vaqt sarflanadi — javob vaqti bo'yicha admin borligini bilib bo'lmaydi. */
const DUMMY = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEYLEN).toString('base64')}`;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? DUMMY).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return !!stored && key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Parol talablari: kamida 8 belgi, harf va raqam, telefon raqamini o'z ichiga olmaydi.
 * (Egasining qarori bilan 12 dan 8 ga tushirilgan; himoya asosan urinishlar qulfiga tayanadi.)
 * Qaytaradi: muammo matni yoki null.
 */
export function passwordProblem(password: string, phone?: string | null): string | null {
  if (password.length < 8) return "Parol kamida 8 belgidan iborat bo'lishi kerak|Пароль должен содержать не менее 8 символов";
  if (password.length > 128) return "Parol juda uzun|Пароль слишком длинный";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Parolda harf ham, raqam ham bo'lishi kerak|Пароль должен содержать и буквы, и цифры";
  const digits = phone?.replace(/\D/g, '').slice(-9);
  if (digits && password.includes(digits)) return "Parolda telefon raqam bo'lmasligi kerak|Пароль не должен содержать номер телефона";
  return null;
}
