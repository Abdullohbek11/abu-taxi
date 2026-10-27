import type { DriverProfile, Payment, Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { displayName } from '../../lib/format.js';
import { imageKey, processImage } from '../../lib/images.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { DAY_MS } from '../../lib/time.js';
import { notify, notifyMany } from '../notifications/notifications.service.js';
import type { BillingSettings } from './billing.schema.js';

/** Sozlama hali saqlanmagan bo'lsa — tarif o'chiq (xizmat bepul). Admin karta va narxni kiritib, yoqadi. */
export const DEFAULT_BILLING: BillingSettings = {
  enabled: false,
  price: 49_000,
  days: 30,
  trialDays: 0,
  cardNumber: '',
  cardHolder: '',
  telegramUsername: '',
  paymeMerchantId: '',
  clickServiceId: '',
  clickMerchantId: '',
};

/** Bitta haydovchida bir vaqtda ko'pi bilan shuncha tekshirilmagan to'lov (spam cheklarga qarshi). */
export const MAX_PENDING_PAYMENTS = 1;

let cache: { value: BillingSettings; at: number } | null = null;
const CACHE_MS = 30_000;

export async function getBillingSettings(): Promise<BillingSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: 'billing' } });
  const value = { ...DEFAULT_BILLING, ...((row?.value as Partial<BillingSettings> | null) ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

export function clearBillingCache() {
  cache = null;
}

const isActive = (p: Pick<DriverProfile, 'subscriptionUntil'>, now = Date.now()) => !!p.subscriptionUntil && p.subscriptionUntil.getTime() > now;

/**
 * Tarif yoqilgan bo'lsa — haydovchining obunasi faol bo'lishi shart. Shunda u yo'lovchini tasdiqlaydi (raqami ochiladi),
 * safar so'rovini oladi va yukka taklif beradi. Ro'yxatdan o'tish, hujjat yuklash, safar e'lon qilish — bepul.
 */
export async function assertDriverSubscription(profile: Pick<DriverProfile, 'subscriptionUntil'>) {
  const s = await getBillingSettings();
  if (s.enabled && !isActive(profile)) throw new AppError('SUBSCRIPTION_REQUIRED');
}

/** Obunani `days` kunga uzaytiradi: faol bo'lsa — tugash sanasidan, aks holda — hozirdan. */
async function extend(tx: Prisma.TransactionClient, driverId: string, days: number, now = new Date()) {
  const p = await tx.driverProfile.findUniqueOrThrow({ where: { id: driverId } });
  const from = isActive(p, now.getTime()) ? p.subscriptionUntil! : now;
  const until = new Date(from.getTime() + days * DAY_MS);
  await tx.driverProfile.update({
    where: { id: driverId },
    data: { subscriptionUntil: until, expiringNotifiedAt: null, expiredNotifiedAt: null },
  });
  return { from, until };
}

/** Payme / Click to'lov sahifasi havolasi (merchant sozlangan bo'lsa). Buyurtma raqami = to'lov ID. */
export function checkoutUrl(provider: 'payme' | 'click', s: BillingSettings, payment: Pick<Payment, 'id' | 'amount'>): string | null {
  if (provider === 'payme') {
    if (!s.paymeMerchantId) return null;
    const params = `m=${s.paymeMerchantId};ac.order_id=${payment.id};a=${payment.amount * 100}`;
    return `https://checkout.paycom.uz/${Buffer.from(params).toString('base64')}`;
  }
  if (!s.clickServiceId || !s.clickMerchantId) return null;
  const q = new URLSearchParams({
    service_id: s.clickServiceId,
    merchant_id: s.clickMerchantId,
    amount: String(payment.amount),
    transaction_param: payment.id,
    return_url: `${env.FRONTEND_URL[0]}/driver/tariff`,
  });
  return `https://my.click.uz/services/pay?${q.toString()}`;
}

function paymentDto(p: Payment) {
  return {
    id: p.id,
    amount: p.amount,
    days: p.days,
    method: p.method,
    status: p.status,
    note: p.note,
    rejectReason: p.rejectReason,
    hasReceipt: !!p.receiptKey,
    periodFrom: p.periodFrom,
    periodUntil: p.periodUntil,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
  };
}

async function driverOf(userId: string) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError('DRIVER_PROFILE_REQUIRED');
  return profile;
}

async function adminIds() {
  return (await prisma.user.findMany({ where: { role: 'ADMIN', isBlocked: false }, select: { id: true } })).map((u) => u.id);
}

export const billingService = {
  /** Haydovchi uchun: tarif, rekvizitlar, obuna holati va to'lovlar tarixi. */
  async plan(userId: string) {
    const [s, profile] = await Promise.all([getBillingSettings(), driverOf(userId)]);
    const payments = await prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
    return {
      enabled: s.enabled,
      price: s.price,
      days: s.days,
      card: s.cardNumber ? { number: s.cardNumber, holder: s.cardHolder } : null,
      telegramUsername: s.telegramUsername || null,
      providers: { payme: !!s.paymeMerchantId, click: !!(s.clickServiceId && s.clickMerchantId) },
      subscription: { active: isActive(profile), until: profile.subscriptionUntil },
      payments: payments.map(paymentDto),
    };
  },

  /** Kartaga o'tkazma: chek rasmi (ixtiyoriy) bilan to'lov yaratiladi, adminlarga xabar boradi. */
  async createCardPayment(userId: string, note: string | undefined, receipt: Buffer | undefined) {
    const s = await getBillingSettings();
    if (!s.enabled) throw new AppError('BILLING_DISABLED');
    const profile = await driverOf(userId);
    const pending = await prisma.payment.count({ where: { userId, status: 'PENDING' } });
    if (pending >= MAX_PENDING_PAYMENTS) throw new AppError('PAYMENT_ALREADY_PENDING');
    const receiptKey = receipt ? await storage.putPrivate(imageKey(`payments/${profile.id}`), await processImage(receipt), 'image/webp') : null;
    const payment = await prisma.payment.create({
      data: { userId, amount: s.price, days: s.days, method: 'CARD', receiptKey, note: note ?? null },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await notifyMany(await adminIds(), 'billing:payment:new', {
      paymentId: payment.id,
      amount: payment.amount,
      driverName: displayName(user.firstName, user.lastName),
      hasReceipt: !!receiptKey,
    });
    return paymentDto(payment);
  },

  /** Payme / Click: to'lov yaratiladi va to'lov sahifasi havolasi qaytadi. */
  async createOnlinePayment(userId: string, provider: 'payme' | 'click') {
    const s = await getBillingSettings();
    if (!s.enabled) throw new AppError('BILLING_DISABLED');
    await driverOf(userId);
    if (!checkoutUrl(provider, s, { id: 'x', amount: s.price })) throw new AppError('PAYMENT_PROVIDER_DISABLED');
    // Avvalgi yakunlanmagan onlayn urinish qayta ishlatiladi (har bosishda yangi yozuv to'planmasin)
    const existing = await prisma.payment.findFirst({ where: { userId, status: 'PENDING', method: provider === 'payme' ? 'PAYME' : 'CLICK' } });
    const pending = await prisma.payment.count({ where: { userId, status: 'PENDING' } });
    if (!existing && pending >= MAX_PENDING_PAYMENTS) throw new AppError('PAYMENT_ALREADY_PENDING');
    const payment =
      existing ??
      (await prisma.payment.create({ data: { userId, amount: s.price, days: s.days, method: provider === 'payme' ? 'PAYME' : 'CLICK' } }));
    return { payment: paymentDto(payment), url: checkoutUrl(provider, s, payment)! };
  },

  // ── Admin ──

  async getSettings() {
    return getBillingSettings();
  },

  async saveSettings(value: BillingSettings) {
    await prisma.setting.upsert({ where: { key: 'billing' }, update: { value }, create: { key: 'billing', value } });
    clearBillingCache();
    return getBillingSettings();
  },

  async list(q: { status?: 'PENDING' | 'CONFIRMED' | 'REJECTED'; limit: number; cursor?: string }) {
    const rows = await prisma.payment.findMany({
      where: q.status ? { status: q.status } : {},
      include: { user: { select: { id: true, phone: true, firstName: true, lastName: true, telegramUsername: true, driverProfile: { select: { subscriptionUntil: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return {
      items: items.map((p) => ({
        ...paymentDto(p),
        user: {
          id: p.user.id,
          phone: p.user.phone,
          name: displayName(p.user.firstName, p.user.lastName),
          telegramUsername: p.user.telegramUsername,
          subscriptionUntil: p.user.driverProfile?.subscriptionUntil ?? null,
        },
      })),
      nextCursor,
    };
  },

  async receiptUrl(id: string) {
    const p = await prisma.payment.findUnique({ where: { id } });
    if (!p || !p.receiptKey) throw new AppError('PAYMENT_NOT_FOUND');
    return { url: await storage.signedUrl(p.receiptKey) };
  },

  /** Tasdiqlash: obuna uzayadi (atomik — ikki marta bosilsa ham bir marta). Haydovchiga xabar boradi. */
  async confirm(adminId: string, id: string) {
    const result = await transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id } });
      if (!p) throw new AppError('PAYMENT_NOT_FOUND');
      const claimed = await tx.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CONFIRMED', reviewedById: adminId, reviewedAt: new Date() } });
      if (claimed.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
      const profile = await tx.driverProfile.findUnique({ where: { userId: p.userId } });
      if (!profile) throw new AppError('DRIVER_PROFILE_REQUIRED');
      const { from, until } = await extend(tx, profile.id, p.days);
      await tx.payment.update({ where: { id }, data: { periodFrom: from, periodUntil: until } });
      return { userId: p.userId, until, amount: p.amount };
    });
    await notify(result.userId, 'billing:activated', { until: result.until.toISOString() });
    return result;
  },

  async reject(adminId: string, id: string, reason: string) {
    const p = await prisma.payment.findUnique({ where: { id } });
    if (!p) throw new AppError('PAYMENT_NOT_FOUND');
    const res = await prisma.payment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, reviewedById: adminId, reviewedAt: new Date() },
    });
    if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
    await notify(p.userId, 'billing:rejected', { reason });
    return { userId: p.userId };
  },

  /** Admin qo'lda obuna beradi (chek Telegram'da kelgan, naqd, bonus). To'lov tarixiga ADMIN usuli bilan yoziladi. */
  async grant(adminId: string, userId: string, days: number, amount = 0, note?: string) {
    const profile = await driverOf(userId);
    const result = await transaction(async (tx) => {
      const { from, until } = await extend(tx, profile.id, days);
      await tx.payment.create({
        data: { userId, amount, days, method: 'ADMIN', status: 'CONFIRMED', note: note ?? null, reviewedById: adminId, reviewedAt: new Date(), periodFrom: from, periodUntil: until },
      });
      return { until };
    });
    await notify(userId, 'billing:activated', { until: result.until.toISOString() });
    return result;
  },

  /** Admin panel uchun: daromad va obunalar. */
  async stats(now = new Date()) {
    const month = new Date(now.getTime() - 30 * DAY_MS);
    const [active, pending, revenue30, revenueAll, s] = await Promise.all([
      prisma.driverProfile.count({ where: { subscriptionUntil: { gt: now } } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.payment.aggregate({ where: { status: 'CONFIRMED', reviewedAt: { gte: month } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amount: true } }),
      getBillingSettings(),
    ]);
    return { enabled: s.enabled, activeSubscriptions: active, pendingPayments: pending, revenue30d: revenue30._sum.amount ?? 0, revenueTotal: revenueAll._sum.amount ?? 0 };
  },
};

/** Yangi tasdiqlangan haydovchiga bepul sinov kunlari (sozlamada berilgan bo'lsa va obunasi bo'lmasa). */
export async function grantTrialIfAny(driverId: string) {
  const s = await getBillingSettings();
  if (!s.trialDays) return null;
  const p = await prisma.driverProfile.findUnique({ where: { id: driverId } });
  if (!p || p.subscriptionUntil) return null;
  const until = new Date(Date.now() + s.trialDays * DAY_MS);
  await prisma.driverProfile.update({ where: { id: driverId }, data: { subscriptionUntil: until } });
  return until;
}

/** Cron: tugashiga 3 kun qolganda va tugaganda haydovchiga bir marta xabar. */
export async function subscriptionReminders(now = new Date()) {
  const s = await getBillingSettings();
  if (!s.enabled) return 0;
  const soon = new Date(now.getTime() + 3 * DAY_MS);
  const [expiring, expired] = await Promise.all([
    prisma.driverProfile.findMany({ where: { subscriptionUntil: { gt: now, lte: soon }, expiringNotifiedAt: null }, select: { id: true, userId: true, subscriptionUntil: true }, take: 500 }),
    prisma.driverProfile.findMany({ where: { subscriptionUntil: { lte: now }, expiredNotifiedAt: null }, select: { id: true, userId: true }, take: 500 }),
  ]);
  for (const p of expiring) {
    await prisma.driverProfile.update({ where: { id: p.id }, data: { expiringNotifiedAt: now } });
    await notify(p.userId, 'billing:expiring', { until: p.subscriptionUntil!.toISOString() });
  }
  for (const p of expired) {
    await prisma.driverProfile.update({ where: { id: p.id }, data: { expiredNotifiedAt: now } });
    await notify(p.userId, 'billing:expired', {});
  }
  return expiring.length + expired.length;
}
