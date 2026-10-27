import type { Prisma, Role, User } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { displayName, maskPlate, photoList } from '../../lib/format.js';
import { signAccessToken } from '../../lib/jwt.js';
import { imageKey, processImage } from '../../lib/images.js';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';

/** Foydalanuvchining o'zi uchun to'liq ma'lumot. */
export function toMeDto(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    lang: user.lang,
    isBlocked: user.isBlocked,
    blockReason: user.blockReason,
    createdAt: user.createdAt,
  };
}

/** Boshqalarga ko'rinadigan qisqa ma'lumot — telefon YO'Q. */
export function toPublicUserDto(
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'> & Partial<Pick<User, 'clientRatingAvg' | 'clientRatingCount'>>,
) {
  return {
    id: user.id,
    name: displayName(user.firstName, user.lastName),
    avatarUrl: user.avatarUrl,
    // Mijoz (yo'lovchi / yuk egasi) reytingi — haydovchi kimni olayotganini bilishi uchun (faqat tanlangan bo'lsa)
    ...(user.clientRatingCount !== undefined
      ? { clientRating: user.clientRatingCount ? { avg: Number(user.clientRatingAvg), count: user.clientRatingCount } : null }
      : {}),
  };
}

/** Mijoz reytingini ko'rsatish uchun select qo'shimchasi */
export const clientRatingSelect = { clientRatingAvg: true, clientRatingCount: true } satisfies Prisma.UserSelect;

export const reviewPublicSelect = {
  id: true,
  rating: true,
  text: true,
  createdAt: true,
  targetRole: true,
  author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} satisfies Prisma.ReviewSelect;

export function toReviewDto(r: Prisma.ReviewGetPayload<{ select: typeof reviewPublicSelect }>) {
  return { id: r.id, rating: r.rating, text: r.text, createdAt: r.createdAt, role: r.targetRole, author: toPublicUserDto(r.author) };
}

export const usersService = {
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: { select: { id: true, status: true, rejectReason: true } } },
    });
    if (!user) throw new AppError('USER_NOT_FOUND');
    return { ...toMeDto(user), driverProfile: user.driverProfile };
  },

  async updateMe(userId: string, data: Prisma.UserUpdateInput) {
    const user = await prisma.user.update({ where: { id: userId }, data });
    return toMeDto(user);
  },

  /**
   * Rol tanlash/almashtirish. ADMIN rolini bu yerda o'zgartirib bo'lmaydi.
   * Faol safari bor haydovchi boshqa rolga o'ta olmaydi.
   * Yangi rol bilan access token qaytariladi.
   */
  async setRole(userId: string, role: Exclude<Role, 'ADMIN'>) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { driverProfile: true } });
    if (user.role === 'ADMIN') throw new AppError('FORBIDDEN');

    if (user.role === 'DRIVER' && role !== 'DRIVER' && user.driverProfile) {
      const active = await prisma.trip.count({
        where: { driverId: user.driverProfile.id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
      });
      if (active > 0) throw new AppError('ROLE_CHANGE_NOT_ALLOWED');
    }

    const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
    return { user: toMeDto(updated), accessToken: signAccessToken({ sub: updated.id, role: updated.role }) };
  },

  async setAvatar(userId: string, file: Buffer) {
    const body = await processImage(file);
    const url = await storage.putPublic(imageKey(`avatars/${userId}`), body, 'image/webp');
    const old = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
    const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    await storage.deletePublicUrl(old.avatarUrl);
    return toMeDto(user);
  },

  async getPublic(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        driverProfile: {
          include: { vehicles: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' } } },
        },
        reviewsReceived: { select: reviewPublicSelect, orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!user || user.isBlocked) throw new AppError('USER_NOT_FOUND');

    const driver = user.driverProfile?.status === 'APPROVED' ? user.driverProfile : null;

    // Haydovchi va mijoz sifatidagi reytinglar alohida, har biri 5★…1★ taqsimoti bilan
    const groups = await prisma.review.groupBy({ by: ['targetRole', 'rating'], where: { targetUserId: userId }, _count: true });
    const pack = (role: 'DRIVER' | 'CLIENT') => {
      const rows = groups.filter((g) => g.targetRole === role);
      const count = rows.reduce((s, g) => s + g._count, 0);
      if (!count) return null;
      const avg = rows.reduce((s, g) => s + g.rating * g._count, 0) / count;
      return {
        avg: Number(avg.toFixed(2)),
        count,
        distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: rows.find((g) => g.rating === stars)?._count ?? 0 })),
      };
    };
    const driverRating = pack('DRIVER');
    const clientRating = pack('CLIENT');
    const rating = driver ? { avg: Number(driver.ratingAvg), count: driver.ratingCount } : { avg: clientRating?.avg ?? 0, count: clientRating?.count ?? 0 };

    // Kech bekor qilishlar (jo'nashga <2 soat qolganda) — ishonchlilik ko'rsatkichi
    const [lateCancellations, completedTrips] = await Promise.all([
      prisma.booking.count({ where: { passengerId: userId, cancelledLate: true } }),
      prisma.booking.count({ where: { passengerId: userId, status: 'COMPLETED' } }),
    ]);

    return {
      ...toPublicUserDto(user),
      role: user.role,
      memberSince: user.createdAt,
      rating,
      driverRating: driver ? driverRating : null,
      clientRating,
      passenger: { completedTrips, lateCancellations },
      driver: driver
        ? {
            tripsCount: driver.tripsCount,
            vehicles: driver.vehicles.map((v) => ({
              id: v.id,
              model: v.model,
              color: v.color,
              plateNumber: maskPlate(v.plateNumber),
              seats: v.seats,
              photos: photoList(v.photos),
              acceptsCargo: v.acceptsCargo,
            })),
          }
        : null,
      reviews: user.reviewsReceived.map(toReviewDto),
    };
  },
};
