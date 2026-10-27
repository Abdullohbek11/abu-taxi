import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { photoList, withPhotos } from '../../lib/format.js';
import { imageKey, processImage } from '../../lib/images.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { getDriverProfile } from '../drivers/drivers.service.js';

const MAX_PHOTOS = 6;

async function ownVehicle(userId: string, vehicleId: string) {
  const profile = await getDriverProfile(userId);
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.driverId !== profile.id) throw new AppError('VEHICLE_NOT_FOUND');
  return vehicle;
}

async function assertPlateFree(plateNumber: string, exceptId?: string) {
  const taken = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (taken && taken.id !== exceptId) throw new AppError('VEHICLE_PLATE_TAKEN');
}

export const vehiclesService = {
  async list(userId: string) {
    const profile = await getDriverProfile(userId);
    const rows = await prisma.vehicle.findMany({ where: { driverId: profile.id }, orderBy: { createdAt: 'asc' } });
    return rows.map(withPhotos);
  },

  async get(userId: string, vehicleId: string) {
    return withPhotos(await ownVehicle(userId, vehicleId));
  },

  async create(userId: string, data: Omit<Prisma.VehicleCreateInput, 'driver'>) {
    const profile = await getDriverProfile(userId);
    await assertPlateFree(data.plateNumber);
    return withPhotos(await prisma.vehicle.create({ data: { ...data, driverId: profile.id, photos: [] } }));
  },

  /** Davlat raqami yoki model o'zgarsa, mashina qayta tekshiruvga (PENDING) tushadi. */
  async update(userId: string, id: string, data: Prisma.VehicleUpdateInput & { plateNumber?: string; model?: string }) {
    const vehicle = await ownVehicle(userId, id);
    if (data.plateNumber) await assertPlateFree(data.plateNumber, id);
    if (typeof data.seats === 'number' && data.seats < vehicle.seats) {
      // Faol safarlardagi o'rinlar mashina sig'imidan oshib ketmasligi kerak
      const conflict = await prisma.trip.count({
        where: { vehicleId: id, status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, totalSeats: { gt: data.seats } },
      });
      if (conflict > 0) throw new AppError('VEHICLE_IN_USE');
    }

    const needsReview =
      (data.plateNumber && data.plateNumber !== vehicle.plateNumber) || (data.model && data.model !== vehicle.model);
    return withPhotos(
      await prisma.vehicle.update({
        where: { id },
        data: { ...data, ...(needsReview ? { status: 'PENDING' as const } : {}) },
      }),
    );
  },

  async remove(userId: string, id: string) {
    const vehicle = await ownVehicle(userId, id);
    const trips = await prisma.trip.count({ where: { vehicleId: id } });
    if (trips > 0) throw new AppError('VEHICLE_IN_USE');
    await prisma.vehicle.delete({ where: { id } });
    await Promise.all(photoList(vehicle.photos).map((url) => storage.deletePublicUrl(url)));
  },

  async addPhotos(userId: string, id: string, files: Buffer[]) {
    const vehicle = await ownVehicle(userId, id);
    const current = photoList(vehicle.photos);
    if (current.length + files.length > MAX_PHOTOS) throw new AppError('VEHICLE_PHOTOS_LIMIT');

    const urls = await Promise.all(
      files.map(async (f) => storage.putPublic(imageKey(`vehicles/${id}`), await processImage(f), 'image/webp')),
    );
    // Parallel yuklashda rasmlar yo'qolmasligi uchun qatorni qulflab, yangi ro'yxatni yozamiz
    return withPhotos(
      await transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Vehicle WHERE id = ${id} FOR UPDATE`;
        const fresh = await tx.vehicle.findUniqueOrThrow({ where: { id } });
        const photos = [...photoList(fresh.photos), ...urls];
        if (photos.length > MAX_PHOTOS) throw new AppError('VEHICLE_PHOTOS_LIMIT');
        return tx.vehicle.update({ where: { id }, data: { photos } });
      }),
    );
  },

  async removePhoto(userId: string, id: string, index: number) {
    const vehicle = await ownVehicle(userId, id);
    const photos = photoList(vehicle.photos);
    const url = photos[index];
    if (!url) throw new AppError('NOT_FOUND');
    const updated = await prisma.vehicle.update({ where: { id }, data: { photos: photos.filter((_, i) => i !== index) } });
    await storage.deletePublicUrl(url);
    return withPhotos(updated);
  },
};
