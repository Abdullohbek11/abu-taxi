/**
 * Admin boshqaruvi (production'da ham ishlaydi):
 *   npm run admin -- grant  +998901234567     # dev
 *   node dist/cli/admin.js grant +998901234567 # production (docker compose exec api ...)
 *   node dist/cli/admin.js revoke +998901234567
 *   node dist/cli/admin.js list
 *   node dist/cli/admin.js password +998901234567   # admin panel paroli (so'raladi, ekranda ko'rinmaydi)
 *
 * Hisob hali yo'q bo'lsa, shu raqam bilan oldindan yaratiladi: admin @bot ga aynan shu raqamni
 * (Telegram kontakti orqali) yuborganda Telegram akkaunti avtomatik bog'lanadi.
 */
import { pathToFileURL } from 'node:url';
import { phoneSchema } from '../modules/auth/auth.schema.js';
import { createInterface } from 'node:readline';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { setAdminPassword } from '../modules/auth/adminAuth.service.js';

/** Terminaldan parolni ekranda ko'rsatmasdan o'qiydi (yoki pipe orqali: echo ... | admin password). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    const out = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    if (process.stdin.isTTY) {
      out._writeToOutput = (s: string) => {
        if (!asked) out.output.write(s);
        else if (s.includes('\n') || s.includes('\r')) out.output.write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    asked = true;
  });
}

/** Terminalda — ikki marta yashirin so'raladi; pipe orqali (CI, skript) — stdin'ning birinchi ikki qatori. */
async function readPasswords(): Promise<[string, string]> {
  if (process.stdin.isTTY) {
    const p1 = await askHidden('Yangi parol (kamida 8 belgi, harf va raqam): ');
    const p2 = await askHidden('Parolni takrorlang: ');
    return [p1, p2];
  }
  let data = '';
  for await (const chunk of process.stdin) data += String(chunk);
  const [p1 = '', p2 = ''] = data.split(/\r?\n/);
  return [p1, p2];
}

export async function setPasswordCli(rawPhone: string, password: string) {
  const phone = phoneSchema.parse(rawPhone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== 'ADMIN') throw new Error(`${phone} — admin emas (avval: admin grant ${phone})`);
  await setAdminPassword(user.id, password, user.phone);
}

export async function grantAdmin(rawPhone: string) {
  const phone = phoneSchema.parse(rawPhone);
  const user = await prisma.user.upsert({
    where: { phone },
    update: { role: 'ADMIN', isBlocked: false },
    create: { phone, role: 'ADMIN' },
  });
  return user;
}

export async function revokeAdmin(rawPhone: string) {
  const phone = phoneSchema.parse(rawPhone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== 'ADMIN') throw new Error(`${phone} — admin emas`);
  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (admins <= 1) throw new Error("Oxirgi adminni o'chirib bo'lmaydi");
  // Rolni tanlash qayta so'raladi; sessiyalar yopiladi
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role: null } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

async function main(argv: string[]) {
  const [cmd, phone] = argv;
  try {
    if (cmd === 'grant' && phone) {
      const u = await grantAdmin(phone);
      console.log(`✅ Admin: ${u.phone} (telegram: ${u.telegramId ?? "hali bog'lanmagan — botga shu raqamni yuboring"})`);
    } else if (cmd === 'revoke' && phone) {
      await revokeAdmin(phone);
      console.log(`✅ ${phone} — adminlikdan olindi`);
    } else if (cmd === 'password' && phone) {
      const [p1, p2] = await readPasswords();
      if (p1 !== p2) throw new Error('Parollar mos kelmadi');
      await setPasswordCli(phone, p1);
      console.log(`✅ ${phone} uchun admin panel paroli o'rnatildi. Kirish: /admin/login`);
    } else if (cmd === 'list') {
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { phone: true, telegramId: true, firstName: true } });
      for (const a of admins) console.log(`${a.phone}\t${a.firstName ?? ''}\ttelegram: ${a.telegramId ?? '—'}`);
    } else {
      console.log('Foydalanish: admin grant|revoke|password <+998XXXXXXXXX> | admin list');
      process.exitCode = 1;
    }
  } catch (err) {
    const detail = err instanceof AppError && err.fields ? Object.values(err.fields)[0]?.split('|')[0] : undefined;
    console.error(`❌ ${detail ?? (err instanceof Error ? err.message : String(err))}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main(process.argv.slice(2));
