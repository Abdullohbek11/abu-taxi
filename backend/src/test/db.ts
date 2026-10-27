import { prisma } from '../lib/prisma.js';
import { resetMemoryLimits } from '../middlewares/rateLimit.js';
import { clearCitiesCache } from '../modules/cities/cities.controller.js';
import { clearBillingCache } from '../modules/billing/billing.service.js';

/** Test bazasini tozalaydi (tashqi kalitlar tartibida) va xotiradagi holatni nolga tushiradi. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.review.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.rideRequest.deleteMany(),
    prisma.cargoOffer.deleteMany(),
    prisma.cargoRequest.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.document.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.driverProfile.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.city.deleteMany(),
    prisma.loginCode.deleteMany(),
    prisma.rateLimit.deleteMany(),
    prisma.jobLock.deleteMany(),
  ]);
  resetMemoryLimits();
  clearBillingCache();
  clearCitiesCache();
}
