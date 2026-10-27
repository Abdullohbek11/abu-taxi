import type { DriverStatus, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { withPhotos } from '../../lib/format.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { SEAT_HOLDING_STATUSES } from '../bookings/bookings.state.js';
import { toMeDto } from '../users/users.service.js';

export const adminService = {
  async listDrivers(status: DriverStatus, limit: number, cursor?: string) {
    const rows = await prisma.driverProfile.findMany({
      where: { status },
      include: {
        user: { select: { id: true, phone: true, firstName: true, lastName: true, telegramUsername: true, avatarUrl: true, isBlocked: true } },
        vehicles: true,
        documents: { select: { id: true, type: true, status: true, createdAt: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map((d) => ({ ...d, ratingAvg: Number(d.ratingAvg), vehicles: d.vehicles.map(withPhotos) })), nextCursor };
  },

  /** Haydovchi tasdiqlanadi — kutilayotgan hujjat va mashinalari ham tasdiqlanadi. */
  async approveDriver(driverId: string) {
    const profile = await prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: { documents: { select: { type: true } } },
    });
    if (!profile) throw new AppError('DRIVER_NOT_FOUND');
    // Tekshirilgan haydovchi — kamida guvohnoma va texpasport bo'lishi shart
    const types = new Set(profile.documents.map((d) => d.type));
    if (!types.has('LICENSE') || !types.has('TECH_PASSPORT')) throw new AppError('DRIVER_DOCUMENTS_MISSING');

    const [updated] = await prisma.$transaction([
      prisma.driverProfile.update({ where: { id: driverId }, data: { status: 'APPROVED', rejectReason: null } }),
      prisma.document.updateMany({ where: { driverId, status: 'PENDING' }, data: { status: 'APPROVED' } }),
      prisma.vehicle.updateMany({ where: { driverId, status: 'PENDING' }, data: { status: 'APPROVED' } }),
    ]);
    return { ...updated, ratingAvg: Number(updated.ratingAvg) };
  },

  async rejectDriver(driverId: string, reason: string) {
    const profile = await prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!profile) throw new AppError('DRIVER_NOT_FOUND');

    const [updated] = await prisma.$transaction([
      prisma.driverProfile.update({ where: { id: driverId }, data: { status: 'REJECTED', rejectReason: reason } }),
      prisma.document.updateMany({ where: { driverId, status: 'PENDING' }, data: { status: 'REJECTED' } }),
    ]);
    return { ...updated, ratingAvg: Number(updated.ratingAvg) };
  },

  async setVehicleStatus(vehicleId: string, status: 'APPROVED' | 'REJECTED') {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new AppError('VEHICLE_NOT_FOUND');
    return prisma.vehicle.update({ where: { id: vehicleId }, data: { status } });
  },

  /**
   * Bloklash: sessiyalar bekor qilinadi va foydalanuvchi faoliyati to'xtatiladi —
   * haydovchining rejalashtirilgan safarlari, yo'lovchining kelgusi band qilishlari,
   * ochiq yuk so'rovlari va kutilayotgan takliflari bekor bo'ladi (boshqa tomonlar xabardor qilinadi).
   */
  async setBlocked(userId: string, isBlocked: boolean, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { driverProfile: true } });
    if (!user) throw new AppError('USER_NOT_FOUND');
    if (user.role === 'ADMIN') throw new AppError('CANNOT_BLOCK_ADMIN');

    const events: BlockEvent[] = [];
    await transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isBlocked, blockReason: isBlocked ? (reason ?? null) : null } });
      if (!isBlocked) return;
      const now = new Date();
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });

      // 1) Yo'lovchi sifatida: rejalashtirilgan safarlardagi faol band qilishlar
      const bookings = await tx.booking.findMany({
        where: { passengerId: userId, status: { in: SEAT_HOLDING_STATUSES }, trip: { status: 'SCHEDULED' } },
        include: { trip: { include: { driver: { select: { userId: true } } } } },
      });
      for (const b of bookings) {
        await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: now } });
        await tx.trip.update({ where: { id: b.tripId }, data: { availableSeats: { increment: b.seats } } });
        events.push({ userId: b.trip.driver.userId, type: 'booking:updated', payload: { bookingId: b.id, tripId: b.tripId, status: 'CANCELLED' } });
      }

      // 2) Haydovchi sifatida: rejalashtirilgan safarlar va kutilayotgan takliflar
      if (user.driverProfile) {
        const trips = await tx.trip.findMany({
          where: { driverId: user.driverProfile.id, status: 'SCHEDULED' },
          include: { bookings: { where: { status: { in: SEAT_HOLDING_STATUSES } }, select: { id: true, passengerId: true } } },
        });
        for (const t of trips) {
          await tx.trip.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });
          await tx.booking.updateMany({
            where: { tripId: t.id, status: { in: SEAT_HOLDING_STATUSES } },
            data: { status: 'CANCELLED', cancelledAt: now },
          });
          for (const b of t.bookings) {
            events.push({ userId: b.passengerId, type: 'trip:updated', payload: { tripId: t.id, bookingId: b.id, status: 'CANCELLED' } });
          }
        }
        await tx.cargoOffer.updateMany({ where: { driverId: user.driverProfile.id, status: 'PENDING' }, data: { status: 'WITHDRAWN' } });
      }

      // 3) Safar so'rovlari: yo'lovchining faol so'rovlari bekor bo'ladi (biriktirilgan haydovchiga xabar)
      const rides = await tx.rideRequest.findMany({
        where: { passengerId: userId, status: { in: ['OPEN', 'ASSIGNED'] } },
        include: { driver: { select: { userId: true } } },
      });
      for (const r of rides) {
        await tx.rideRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', cancelledAt: now } });
        if (r.driver) events.push({ userId: r.driver.userId, type: 'ride:request:updated', payload: { requestId: r.id, status: 'CANCELLED' } });
      }

      // 4) Yuk jo'natuvchi sifatida: ochiq so'rovlar
      const cargo = await tx.cargoRequest.findMany({
        where: { senderId: userId, status: 'OPEN' },
        include: { offers: { where: { status: 'PENDING' }, include: { driver: { select: { userId: true } } } } },
      });
      for (const c of cargo) {
        await tx.cargoRequest.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
        await tx.cargoOffer.updateMany({ where: { cargoRequestId: c.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
        for (const o of c.offers) {
          events.push({ userId: o.driver.userId, type: 'cargo:updated', payload: { cargoId: c.id, status: 'CANCELLED' } });
        }
      }
    });
    return { result: { id: userId, isBlocked }, events };
  },

  async listUsers(q: { q?: string; role?: Role; blocked?: boolean; limit: number; cursor?: string }) {
    const search = q.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.blocked !== undefined ? { isBlocked: q.blocked } : {}),
      ...(search
        ? {
            OR: [
              { phone: { contains: search.replace(/[\s-]/g, '') } },
              // MySQL utf8mb4_0900_ai_ci — katta/kichik harfni farqlamaydi
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { telegramUsername: { contains: search.replace(/^@/, '') } },
            ],
          }
        : {}),
    };
    const rows = await prisma.user.findMany({
      where,
      include: { driverProfile: { select: { id: true, status: true, ratingAvg: true, ratingCount: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((u) => ({
        ...toMeDto(u),
        driverProfile: u.driverProfile ? { ...u.driverProfile, ratingAvg: Number(u.driverProfile.ratingAvg) } : null,
      })),
      nextCursor,
    };
  },

  async listAudit(q: { targetType?: string; targetId?: string; limit: number; cursor?: string }) {
    const rows = await prisma.auditLog.findMany({
      where: { ...(q.targetType ? { targetType: q.targetType } : {}), ...(q.targetId ? { targetId: q.targetId } : {}) },
      include: { admin: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    return paginate(rows, q.limit);
  },
};

export interface BlockEvent {
  userId: string;
  type: 'booking:updated' | 'trip:updated' | 'cargo:updated' | 'ride:request:updated';
  payload: Record<string, unknown>;
}

/** Admin amalini jurnalga yozadi. */
export async function audit(
  adminId: string,
  action: string,
  target: { type: string; id: string },
  meta?: Record<string, unknown>,
  ip?: string,
) {
  await prisma.auditLog.create({
    data: { adminId, action, targetType: target.type, targetId: target.id, meta: meta as Prisma.InputJsonValue, ip },
  });
}
