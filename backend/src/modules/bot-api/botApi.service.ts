import { Prisma, type User } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { personName } from '../../lib/validators.js';
import { loginCodeService } from '../auth/loginCode.service.js';
import type { LoginCodeRequest } from './botApi.schema.js';

/** Telegram username'i faqat to'g'ri formatda saqlanadi (kontakt sifatida ko'rsatiladi). */
function cleanUsername(v: string | undefined): string | null {
  return v && /^[A-Za-z0-9_]{4,32}$/.test(v) ? v : null;
}

/** Telegram ismi faqat bizning qoidalarga mos bo'lsa olinadi (emoji, havola va h.k. — yo'q). */
function cleanName(v: string | undefined): string | undefined {
  const r = personName.safeParse(v ?? '');
  return r.success ? r.data : undefined;
}

/**
 * Telegram foydalanuvchisini hisob bilan moslaydi:
 *  - telegramId bo'yicha topilsa — o'sha hisob (raqam o'zgargan bo'lsa yangilanadi);
 *  - topilmasa, raqam bo'yicha mavjud hisobga (Telegram'i bog'lanmagan bo'lsa) bog'lanadi;
 *  - hech biri yo'q bo'lsa — yangi hisob (ro'yxatdan o'tish).
 * Raqam faqat Telegram kontakti orqali keladi (bot contact.user_id === from.id ni tekshiradi).
 */
async function resolveUser(req: LoginCodeRequest): Promise<User> {
  return transaction(async (tx) => {
    const byTg = await tx.user.findUnique({ where: { telegramId: req.telegramId } });
    const profile = {
      telegramUsername: cleanUsername(req.username),
      ...(byTg?.firstName ? {} : { firstName: cleanName(req.firstName) }),
      ...(byTg?.lastName ? {} : { lastName: cleanName(req.lastName) }),
    };

    if (!req.phone) {
      if (!byTg?.phone) throw new AppError('PHONE_REQUIRED');
      return tx.user.update({ where: { id: byTg.id }, data: profile });
    }

    const byPhone = await tx.user.findUnique({ where: { phone: req.phone } });
    if (byTg) {
      if (byPhone && byPhone.id !== byTg.id) throw new AppError('PHONE_TAKEN');
      return tx.user.update({ where: { id: byTg.id }, data: { ...profile, phone: req.phone } });
    }
    if (byPhone) {
      // Raqam boshqa Telegram akkauntga bog'langan — raqam qayta sotilgan bo'lishi mumkin; avtomatik ko'chirmaymiz
      if (byPhone.telegramId) throw new AppError('PHONE_TAKEN');
      return tx.user.update({
        where: { id: byPhone.id },
        data: {
          telegramId: req.telegramId,
          telegramUsername: cleanUsername(req.username),
          ...(byPhone.firstName ? {} : { firstName: cleanName(req.firstName) }),
          ...(byPhone.lastName ? {} : { lastName: cleanName(req.lastName) }),
        },
      });
    }
    return tx.user.create({
      data: {
        telegramId: req.telegramId,
        phone: req.phone,
        telegramUsername: cleanUsername(req.username),
        firstName: cleanName(req.firstName),
        lastName: cleanName(req.lastName),
        lang: req.languageCode?.toLowerCase().startsWith('ru') ? 'RU' : 'UZ',
      },
    });
  });
}

export const botApiService = {
  async loginCode(req: LoginCodeRequest) {
    let user: User;
    try {
      user = await resolveUser(req);
    } catch (err) {
      // Bir vaqtda ikki so'rov bir xil hisob yaratmoqchi bo'lsa — ikkinchisi mavjudini topadi
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') user = await resolveUser(req);
      else throw err;
    }
    if (user.isBlocked) throw new AppError('USER_BLOCKED');
    const { code, expiresIn } = await loginCodeService.issue(user.id, req.telegramId);
    return { code, expiresIn, isNew: user.role === null, lang: user.lang };
  },

  /**
   * Telegram'ga yuborilmagan bildirishnomalar (outbox). Faqat Telegram'i bog'langan
   * foydalanuvchilar va oxirgi 1 soatdagilar — bot uzoq o'chiq bo'lsa eski xabarlar to'planib yuborilmaydi.
   */
  async pendingNotifications(limit: number) {
    const rows = await prisma.notification.findMany({
      where: {
        telegramSentAt: null,
        createdAt: { gte: new Date(Date.now() - 3600_000) },
        user: { telegramId: { not: null }, isBlocked: false },
      },
      include: { user: { select: { telegramId: true, lang: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((n) => ({ id: n.id, telegramId: n.user.telegramId!, lang: n.user.lang, type: n.type, payload: n.payload }));
  },

  async ackNotifications(ids: string[]) {
    const res = await prisma.notification.updateMany({
      where: { id: { in: ids }, telegramSentAt: null },
      data: { telegramSentAt: new Date() },
    });
    return { updated: res.count };
  },
};
