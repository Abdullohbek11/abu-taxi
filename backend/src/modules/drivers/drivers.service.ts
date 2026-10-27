import type { DocumentType } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { withPhotos } from '../../lib/format.js';
import { imageKey, processImage } from '../../lib/images.js';
import { signAccessToken } from '../../lib/jwt.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { toMeDto } from '../users/users.service.js';

/** Foydalanuvchining haydovchi profili (bo'lmasa 403). */
export async function getDriverProfile(userId: string) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError('DRIVER_PROFILE_REQUIRED');
  return profile;
}

/** Faqat APPROVED haydovchi safar e'lon qiladi va yukka taklif beradi. */
export async function getApprovedDriver(userId: string) {
  const profile = await getDriverProfile(userId);
  if (profile.status !== 'APPROVED') throw new AppError('DRIVER_NOT_APPROVED');
  return profile;
}

export const driversService = {
  /** Haydovchi profili yaratiladi (PENDING), foydalanuvchi roli DRIVER bo'ladi. */
  async register(userId: string, data: { firstName: string; lastName: string }) {
    const existing = await prisma.driverProfile.findUnique({ where: { userId } });
    if (existing) throw new AppError('DRIVER_ALREADY_REGISTERED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === 'ADMIN') throw new AppError('FORBIDDEN');
    // Yo'lovchilar haydovchi bilan telefon orqali bog'lanadi — tasdiqlangan raqam majburiy
    if (!user.phone) throw new AppError('PHONE_REQUIRED');

    const [updated, profile] = await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { ...data, role: 'DRIVER' } }),
      prisma.driverProfile.create({ data: { userId } }),
    ]);
    return {
      user: toMeDto(updated),
      driverProfile: profile,
      accessToken: signAccessToken({ sub: updated.id, role: updated.role }),
    };
  },

  async getMe(userId: string) {
    const profile = await prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        vehicles: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!profile) throw new AppError('DRIVER_PROFILE_REQUIRED');

    // Egasi o'z hujjatlarini 10 daqiqalik havola orqali ko'ra oladi
    const documents = await Promise.all(
      profile.documents.map(async ({ fileKey, ...d }) => ({ ...d, url: await storage.signedUrl(fileKey) })),
    );
    return { ...profile, ratingAvg: Number(profile.ratingAvg), vehicles: profile.vehicles.map(withPhotos), documents };
  },

  /**
   * Hujjat yuklash (PRIVATE bucket). Shu turdagi eski hujjat almashtiriladi.
   * Rad etilgan profil qayta ko'rib chiqish uchun PENDING holatiga qaytadi.
   */
  async uploadDocument(userId: string, type: DocumentType, file: Buffer) {
    const profile = await getDriverProfile(userId);
    const body = await processImage(file);
    const key = await storage.putPrivate(imageKey(`drivers/${profile.id}/documents`), body, 'image/webp');

    const old = await prisma.document.findMany({ where: { driverId: profile.id, type } });
    const document = await transaction(async (tx) => {
      await tx.document.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
      if (profile.status === 'REJECTED') {
        await tx.driverProfile.update({ where: { id: profile.id }, data: { status: 'PENDING', rejectReason: null } });
      }
      return tx.document.create({ data: { driverId: profile.id, type, fileKey: key } });
    });
    await Promise.all(old.map((d) => storage.deletePrivate(d.fileKey)));

    const { fileKey, ...rest } = document;
    return { ...rest, url: await storage.signedUrl(fileKey) };
  },
};
