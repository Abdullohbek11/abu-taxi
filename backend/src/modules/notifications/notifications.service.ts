import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { paginate } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { emitToUser } from '../../lib/realtime.js';
import type { NotificationPayload, NotificationType } from './notifications.types.js';

/**
 * Hodisani yetkazadi: Notification jadvaliga yozadi va Socket.IO orqali (`<type>` va `notification:new`) yuboradi.
 * Telegram'ga bot yuboradi: u yozuvni navbatdan oladi (outbox, `telegramSentAt`) — backend Telegram tokenini bilmaydi.
 * Hech qachon xato tashlamaydi — asosiy amal bildirishnoma tufayli buzilmasligi kerak.
 */
export async function notify(userId: string | null | undefined, type: NotificationType, payload: NotificationPayload) {
  if (!userId) return;
  try {
    const n = await prisma.notification.create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } });
    emitToUser(userId, type, payload);
    emitToUser(userId, 'notification:new', n);

  } catch (err) {
    logger.error({ err, type }, 'Bildirishnoma yuborilmadi');
  }
}

export async function notifyMany(userIds: (string | null | undefined)[], type: NotificationType, payload: NotificationPayload) {
  await Promise.all([...new Set(userIds)].map((id) => notify(id, type, payload)));
}

export const notificationsService = {
  async list(userId: string, limit: number, cursor?: string, unreadOnly = false) {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { ...paginate(rows, limit), unreadCount };
  },

  async read(userId: string, id: string) {
    const res = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (res.count === 0) {
      const exists = await prisma.notification.findFirst({ where: { id, userId } });
      if (!exists) throw new AppError('NOTIFICATION_NOT_FOUND');
    }
    return prisma.notification.findUniqueOrThrow({ where: { id } });
  },

  async readAll(userId: string) {
    const res = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  },
};
