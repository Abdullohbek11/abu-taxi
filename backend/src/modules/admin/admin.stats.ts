import { prisma } from '../../lib/prisma.js';
import { DAY_MS } from '../../lib/time.js';

const countBy = <K extends string>(rows: { _count: number }[], key: K) =>
  Object.fromEntries(rows.map((r) => [(r as unknown as Record<K, string>)[key], r._count]));

/** Admin paneli uchun umumiy ko'rsatkichlar. */
export async function adminStats(now = new Date()) {
  const day = new Date(now.getTime() - DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const month = new Date(now.getTime() - 30 * DAY_MS);

  const [
    usersByRole,
    blockedUsers,
    newUsersWeek,
    driversByStatus,
    tripsByStatus,
    bookingsByStatus,
    bookingsToday,
    lateCancellationsMonth,
    cargoByStatus,
    gmvMonth,
    cargoGmvMonth,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.user.count({ where: { isBlocked: true } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.driverProfile.groupBy({ by: ['status'], _count: true }),
    prisma.trip.groupBy({ by: ['status'], _count: true }),
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.booking.count({ where: { createdAt: { gte: day } } }),
    prisma.booking.count({ where: { cancelledLate: true, cancelledAt: { gte: month } } }),
    prisma.cargoRequest.groupBy({ by: ['status'], _count: true }),
    prisma.booking.aggregate({ where: { status: 'COMPLETED', updatedAt: { gte: month } }, _sum: { totalPrice: true } }),
    prisma.cargoOffer.aggregate({
      where: { status: 'ACCEPTED', cargoRequest: { status: 'DELIVERED', deliveredAt: { gte: month } } },
      _sum: { price: true },
    }),
  ]);

  return {
    users: {
      byRole: countBy(usersByRole.map((r) => ({ ...r, role: r.role ?? 'NONE' })), 'role'),
      blocked: blockedUsers,
      newLast7Days: newUsersWeek,
    },
    drivers: countBy(driversByStatus, 'status'),
    trips: countBy(tripsByStatus, 'status'),
    bookings: { byStatus: countBy(bookingsByStatus, 'status'), last24h: bookingsToday, lateCancellations30d: lateCancellationsMonth },
    cargo: countBy(cargoByStatus, 'status'),
    /** Platforma orqali o'tgan kelishuvlar hajmi (so'm), oxirgi 30 kun */
    volume30d: {
      passengers: gmvMonth._sum.totalPrice ?? 0,
      cargo: cargoGmvMonth._sum.price ?? 0,
    },
  };
}
