import { Prisma, type ReviewRole } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction, type Tx } from '../../lib/prisma.js';
import { DAY_MS } from '../../lib/time.js';
import { reviewPublicSelect, toReviewDto } from '../users/users.service.js';
import type { CreateReviewBody } from './reviews.schema.js';

export const REVIEW_WINDOW_MS = 14 * DAY_MS;

function assertWindow(finishedAt: Date) {
  if (Date.now() - finishedAt.getTime() > REVIEW_WINDOW_MS) throw new AppError('REVIEW_WINDOW_CLOSED');
}

/** Bayes bahosi (saralash uchun): sharh kam bo'lsa — o'rtacha bahoga (4.3) yaqin, ko'paygan sari haqiqiy bahoga. */
export const RATING_PRIOR = 4.3;
export const RATING_PRIOR_WEIGHT = 5;
export function ratingScore(avg: number, count: number): number {
  return (avg * count + RATING_PRIOR * RATING_PRIOR_WEIGHT) / (count + RATING_PRIOR_WEIGHT);
}

interface Target {
  targetUserId: string;
  /** Haydovchiga (DRIVER) yoki mijozga — yo'lovchi / yuk egasi (CLIENT) */
  targetRole: ReviewRole;
}

const target = (authorId: string, driverUserId: string, clientUserId: string): Target =>
  authorId === clientUserId ? { targetUserId: driverUserId, targetRole: 'DRIVER' } : { targetUserId: clientUserId, targetRole: 'CLIENT' };

/** Sharh kimga yoziladi: safar/yuk ishtirokchisi bo'lmasa — 403. */
async function resolveTarget(authorId: string, body: CreateReviewBody): Promise<Target> {
  if (body.bookingId) {
    const b = await prisma.booking.findUnique({
      where: { id: body.bookingId },
      include: { trip: { include: { driver: { select: { userId: true } } } } },
    });
    if (!b) throw new AppError('BOOKING_NOT_FOUND');
    const driverUserId = b.trip.driver.userId;
    if (authorId !== b.passengerId && authorId !== driverUserId) throw new AppError('REVIEW_NOT_ALLOWED');
    if (b.status !== 'COMPLETED' || b.trip.status !== 'COMPLETED') throw new AppError('REVIEW_NOT_ALLOWED');
    assertWindow(b.trip.completedAt ?? b.trip.updatedAt);
    return target(authorId, driverUserId, b.passengerId);
  }

  if (body.rideRequestId) {
    // "Olaman" orqali kelishilgan safar: safar kuni boshlangandan keyin baholanadi.
    // Admin qo'lda biriktirgan (tizimda yo'q) haydovchiga reyting yozilmaydi.
    const r = await prisma.rideRequest.findUnique({ where: { id: body.rideRequestId }, include: { driver: { select: { userId: true } } } });
    if (!r) throw new AppError('RIDE_REQUEST_NOT_FOUND');
    const driverUserId = r.driver?.userId;
    if (!driverUserId || (authorId !== r.passengerId && authorId !== driverUserId)) throw new AppError('REVIEW_NOT_ALLOWED');
    if (r.status !== 'ASSIGNED' || r.date.getTime() > Date.now()) throw new AppError('REVIEW_NOT_ALLOWED');
    assertWindow(new Date(r.date.getTime() + DAY_MS));
    return target(authorId, driverUserId, r.passengerId);
  }

  const c = await prisma.cargoRequest.findUnique({
    where: { id: body.cargoRequestId! },
    include: { offers: { where: { status: 'ACCEPTED' }, include: { driver: { select: { userId: true } } } } },
  });
  if (!c) throw new AppError('CARGO_NOT_FOUND');
  const driverUserId = c.offers[0]?.driver.userId;
  if (!driverUserId || (authorId !== c.senderId && authorId !== driverUserId)) throw new AppError('REVIEW_NOT_ALLOWED');
  if (c.status !== 'DELIVERED') throw new AppError('REVIEW_NOT_ALLOWED');
  assertWindow(c.deliveredAt ?? c.updatedAt);
  return target(authorId, driverUserId, c.senderId);
}

/**
 * Reytingni qayta hisoblaydi (denormalizatsiya: qidiruvda saralash va ro'yxatlarda ko'rsatish uchun).
 * Haydovchi va mijoz reytinglari alohida: haydovchi yo'lovchi bo'lib yurganda olgan baholar haydovchi reytingiga qo'shilmaydi.
 */
export async function recalcRating(tx: Tx | typeof prisma, userId: string, role: ReviewRole) {
  const agg = await tx.review.aggregate({ where: { targetUserId: userId, targetRole: role }, _avg: { rating: true }, _count: true });
  const avg = agg._avg.rating ?? 0;
  if (role === 'CLIENT') {
    await tx.user.update({ where: { id: userId }, data: { clientRatingAvg: new Prisma.Decimal(avg.toFixed(2)), clientRatingCount: agg._count } });
    return;
  }
  const profile = await tx.driverProfile.findUnique({ where: { userId } });
  if (!profile) return;
  await tx.driverProfile.update({
    where: { userId },
    data: {
      ratingAvg: new Prisma.Decimal(avg.toFixed(2)),
      ratingCount: agg._count,
      ratingScore: new Prisma.Decimal(ratingScore(avg, agg._count).toFixed(3)),
    },
  });
}

export const reviewsService = {
  async create(authorId: string, body: CreateReviewBody) {
    const { targetUserId, targetRole } = await resolveTarget(authorId, body);
    try {
      const review = await transaction(async (tx) => {
        const r = await tx.review.create({
          data: {
            authorId,
            targetUserId,
            bookingId: body.bookingId,
            cargoRequestId: body.cargoRequestId,
            rideRequestId: body.rideRequestId,
            targetRole,
            rating: body.rating,
            text: body.text,
          },
          select: reviewPublicSelect,
        });
        await recalcRating(tx, targetUserId, targetRole);
        return r;
      });
      return { review: { ...toReviewDto(review), targetUserId }, targetUserId };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError('REVIEW_ALREADY_EXISTS');
      throw err;
    }
  },

  /**
   * Landing uchun oxirgi haqiqiy sharhlar: matnli, 4–5 baho, haydovchilarga yozilgan.
   * Yo'nalish va oy ko'rsatiladi (masalan "Andijon → Toshkent · sentabr").
   */
  async recent(limit: number) {
    const rows = await prisma.review.findMany({
      where: {
        rating: { gte: 4 },
        text: { not: null },
        targetRole: 'DRIVER',
        author: { isBlocked: false },
        targetUser: { driverProfile: { status: 'APPROVED' } },
      },
      select: {
        ...reviewPublicSelect,
        booking: { select: { trip: { select: { fromCity: { select: { nameUz: true, nameRu: true } }, toCity: { select: { nameUz: true, nameRu: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows
      .filter((r) => (r.text ?? '').trim().length >= 10)
      .map(({ booking, ...r }) => ({
        ...toReviewDto(r),
        route: booking ? { from: booking.trip.fromCity, to: booking.trip.toCity } : null,
      }));
  },

  async listForUser(userId: string, limit: number, cursor?: string, role?: ReviewRole) {
    const rows = await prisma.review.findMany({
      where: { targetUserId: userId, ...(role ? { targetRole: role } : {}) },
      select: reviewPublicSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map(toReviewDto), nextCursor };
  },
};
