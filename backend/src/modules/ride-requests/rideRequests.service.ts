import type { Prisma, RideRequestStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { toContact } from '../../lib/contact.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { hitWithTtl } from '../../lib/rateLimit.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { DAY_MS, TASHKENT_OFFSET_MIN, tashkentToUtc } from '../../lib/time.js';
import { getApprovedDriver, getDriverProfile } from '../drivers/drivers.service.js';
import { assertCities, cityIds } from '../trips/trips.service.js';
import { clientRatingSelect, toPublicUserDto } from '../users/users.service.js';
import { assertDriverSubscription } from '../billing/billing.service.js';
import type { AssignRideRequestBody, CreateRideRequestBody, OpenRideRequestsQuery } from './rideRequests.schema.js';
import { RIDE_REQUEST_TRANSITIONS } from './rideRequests.state.js';

/** Spam so'rovlarga qarshi: bir vaqtda ochiq so'rovlar soni. */
export const MAX_OPEN_RIDE_REQUESTS = 3;
/**
 * Bir kunda yaratish mumkin bo'lgan so'rovlar. Har so'rov 30 tagacha haydovchiga Telegram xabar yuboradi —
 * "yaratib-bekor qilish" orqali haydovchilarni spam qilishning oldi olinadi.
 */
export const MAX_RIDE_REQUESTS_PER_DAY = 5;
/** Bir so'rov haqida shaxsiy xabar oladigan haydovchilar soni. */
export const MAX_NOTIFIED_DRIVERS = 30;
/** Haydovchi shu yo'nalishda oxirgi shuncha vaqt ichida safar e'lon qilgan bo'lsa — "mos" hisoblanadi. */
const DRIVER_ROUTE_LOOKBACK_MS = 90 * DAY_MS;
const ACTIVE: RideRequestStatus[] = ['OPEN', 'ASSIGNED'];

const citySelect = { id: true, nameUz: true, nameRu: true, region: true } satisfies Prisma.CitySelect;
const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  phone: true,
  telegramUsername: true,
  ...clientRatingSelect,
} satisfies Prisma.UserSelect;

const include = {
  fromCity: { select: citySelect },
  toCity: { select: citySelect },
  passenger: { select: userSelect },
  driver: { select: { userId: true } },
  reviews: { select: { authorId: true } },
} satisfies Prisma.RideRequestInclude;

type RideRequestFull = Prisma.RideRequestGetPayload<{ include: typeof include }>;

/** Toshkent bo'yicha bugungi kunning boshi (UTC). */
function todayStart(now = Date.now()): Date {
  const local = new Date(now + TASHKENT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
  return tashkentToUtc(local);
}

const fullName = (u: { firstName: string | null; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Foydalanuvchi';

/** Yo'lovchiga ko'rsatiladigan haydovchi ma'lumoti (faqat ASSIGNED bo'lganda). */
function assignment(r: RideRequestFull) {
  if (r.status !== 'ASSIGNED') return null;
  return {
    driverName: r.driverName,
    phone: r.driverPhone,
    telegramUsername: r.driverTelegram,
    carModel: r.carModel,
    carColor: r.carColor,
    carPlate: r.carPlate,
    pricePerSeat: r.pricePerSeat,
    assignedAt: r.assignedAt,
  };
}

/**
 * So'rov ko'rinishi:
 *  - public (haydovchilar ro'yxati): yo'nalish, sana, odam soni, izoh — telefon yo'q;
 *  - passenger: + biriktirilgan haydovchi, mashina, narx va telefon;
 *  - driver (o'ziga biriktirilgan): + yo'lovchi kontakti;
 *  - admin: hammasi.
 */
function toDto(r: RideRequestFull, view: 'public' | 'passenger' | 'driver' | 'admin') {
  const base = {
    id: r.id,
    from: r.fromCity,
    to: r.toCity,
    date: r.date,
    seats: r.seats,
    offeredPrice: r.offeredPrice,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    passenger: toPublicUserDto(r.passenger),
  };
  if (view === 'public') return base;
  const showPassenger = view === 'admin' || (view === 'driver' && r.status === 'ASSIGNED');
  return {
    ...base,
    assignment: view === 'passenger' || view === 'admin' ? assignment(r) : null,
    pricePerSeat: r.pricePerSeat,
    passengerContact: showPassenger ? { name: fullName(r.passenger), ...toContact(r.passenger) } : null,
    driverUserId: view === 'passenger' && r.status === 'ASSIGNED' ? (r.driver?.userId ?? null) : undefined,
    canReview: view === 'passenger' ? canReview(r, r.passengerId) : view === 'driver' ? canReview(r, r.driver?.userId) : false,
    ...(view === 'admin'
      ? {
          notifiedDrivers: r.notifiedDrivers,
          groupPostedAt: r.groupPostedAt,
          manual: r.status === 'ASSIGNED' && !r.driverId,
          cancelledAt: r.cancelledAt,
        }
      : {}),
  };
}

async function load(id: string) {
  const r = await prisma.rideRequest.findUnique({ where: { id }, include });
  if (!r) throw new AppError('RIDE_REQUEST_NOT_FOUND');
  return r;
}

/** Bildirishnoma va bot xabarlari uchun qisqa ma'lumot. */
export function summary(r: RideRequestFull) {
  return {
    requestId: r.id,
    from: { uz: r.fromCity.nameUz, ru: r.fromCity.nameRu },
    to: { uz: r.toCity.nameUz, ru: r.toCity.nameRu },
    date: r.date.toISOString(),
    seats: r.seats,
    offeredPrice: r.offeredPrice,
    note: r.note,
  };
}

/** Yo'lovchiga yuboriladigan "haydovchi topildi" xabari. */
export function assignedPayload(r: RideRequestFull) {
  return {
    ...summary(r),
    status: 'ASSIGNED',
    driverName: r.driverName,
    phone: r.driverPhone,
    telegramUsername: r.driverTelegram,
    carModel: r.carModel,
    carColor: r.carColor,
    carPlate: r.carPlate,
    pricePerSeat: r.pricePerSeat,
  };
}

/** Haydovchiga yuboriladigan yo'lovchi ma'lumoti. */
export function passengerPayload(r: RideRequestFull) {
  return {
    ...summary(r),
    status: 'ASSIGNED',
    passengerName: fullName(r.passenger),
    phone: r.passenger.phone,
    telegramUsername: r.passenger.telegramUsername,
    pricePerSeat: r.pricePerSeat,
  };
}

/** Safar kuni boshlangan va 14 kunlik muddat o'tmagan bo'lsa, ishtirokchi hali baho qo'ymagan bo'lsa — sharh mumkin. */
function canReview(r: RideRequestFull, viewerId: string | undefined, now = Date.now()) {
  if (!viewerId || r.status !== 'ASSIGNED' || !r.driverId) return false;
  const start = r.date.getTime();
  if (start > now || now - (start + DAY_MS) > 14 * DAY_MS) return false;
  return !r.reviews.some((v) => v.authorId === viewerId);
}

/** So'rov hali olinishi mumkinmi (OPEN va sanasi o'tmagan). */
function assertOpen(r: { status: RideRequestStatus; date: Date }) {
  if (r.status !== 'OPEN' || r.date.getTime() < todayStart().getTime()) throw new AppError('RIDE_REQUEST_NOT_OPEN');
}

/**
 * Shu yo'nalishda (ikkala tomonga) oxirgi 90 kunda safar e'lon qilgan tasdiqlangan haydovchilar.
 * Faqat Telegram'i bog'langan, bloklanmagan va tasdiqlangan mashinasi borlar.
 */
async function matchingDriverUserIds(fromRegion: string, toRegion: string, exceptUserId: string) {
  const since = new Date(Date.now() - DRIVER_ROUTE_LOOKBACK_MS);
  const rows = await prisma.driverProfile.findMany({
    where: {
      status: 'APPROVED',
      userId: { not: exceptUserId },
      user: { isBlocked: false, telegramId: { not: null } },
      vehicles: { some: { status: 'APPROVED' } },
      trips: {
        some: {
          createdAt: { gte: since },
          OR: [
            { fromCity: { region: fromRegion }, toCity: { region: toRegion } },
            { fromCity: { region: toRegion }, toCity: { region: fromRegion } },
          ],
        },
      },
    },
    select: { userId: true },
    orderBy: { ratingAvg: 'desc' },
    take: MAX_NOTIFIED_DRIVERS,
  });
  return rows.map((d) => d.userId);
}

/** Haydovchi so'rovni oladi (sayt yoki bot orqali). Atomik: ikki haydovchidan faqat bittasi o'tadi. */
async function takeAsDriver(userId: string, id: string, pricePerSeat: number, vehicleId?: string) {
  const profile = await getApprovedDriver(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.isBlocked) throw new AppError('USER_BLOCKED');
  await assertDriverSubscription(profile);
  const vehicle = await prisma.vehicle.findFirst({
    where: { driverId: profile.id, status: 'APPROVED', ...(vehicleId ? { id: vehicleId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (!vehicle) throw new AppError('VEHICLE_NOT_APPROVED');

  const r = await prisma.rideRequest.findUnique({ where: { id } });
  if (!r) throw new AppError('RIDE_REQUEST_NOT_FOUND');
  if (r.passengerId === userId) throw new AppError('CANNOT_TAKE_OWN_REQUEST');
  assertOpen(r);
  assertTransition(RIDE_REQUEST_TRANSITIONS, r.status, 'ASSIGNED');

  const res = await prisma.rideRequest.updateMany({
    where: { id, status: 'OPEN' },
    data: {
      status: 'ASSIGNED',
      driverId: profile.id,
      vehicleId: vehicle.id,
      pricePerSeat,
      driverName: fullName(user),
      driverPhone: user.phone,
      driverTelegram: user.telegramUsername,
      carModel: vehicle.model,
      carColor: vehicle.color,
      carPlate: vehicle.plateNumber,
      assignedAt: new Date(),
    },
  });
  if (res.count === 0) throw new AppError('RIDE_REQUEST_NOT_OPEN');
  return load(id);
}

async function setStatus(r: { id: string; status: RideRequestStatus }, to: RideRequestStatus) {
  assertTransition(RIDE_REQUEST_TRANSITIONS, r.status, to);
  const res = await prisma.rideRequest.updateMany({
    where: { id: r.id, status: r.status },
    data: { status: to, ...(to === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
  });
  if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
}

/** Telegram ID bo'yicha haydovchi hisobini topadi (bot orqali olishda). */
async function userIdByTelegram(telegramId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true, isBlocked: true } });
  if (!user) throw new AppError('DRIVER_PROFILE_REQUIRED');
  if (user.isBlocked) throw new AppError('USER_BLOCKED');
  return user.id;
}

export const rideRequestsService = {
  async create(userId: string, data: CreateRideRequestBody) {
    await assertCities(data.fromCityId, data.toCityId);
    const date = tashkentToUtc(data.date);
    if (date.getTime() < todayStart().getTime()) throw new AppError('RIDE_REQUEST_DATE_IN_PAST');
    const open = await prisma.rideRequest.count({ where: { passengerId: userId, status: 'OPEN' } });
    if (open >= MAX_OPEN_RIDE_REQUESTS) throw new AppError('TOO_MANY_RIDE_REQUESTS');
    const daily = await hitWithTtl(`riderequest:create:${userId}`, MAX_RIDE_REQUESTS_PER_DAY, 24 * 3600);
    if (!daily.allowed) throw new AppError('RIDE_REQUEST_DAILY_LIMIT', undefined, { retryAfter: daily.retryAfter });

    const created = await prisma.rideRequest.create({ data: { ...data, date, passengerId: userId } });
    const r = await load(created.id);
    const driverUserIds = await matchingDriverUserIds(r.fromCity.region, r.toCity.region, userId);
    if (driverUserIds.length) {
      await prisma.rideRequest.update({ where: { id: r.id }, data: { notifiedDrivers: driverUserIds.length } });
    }
    return { request: toDto(r, 'passenger'), payload: summary(r), driverUserIds };
  },

  async listMine(userId: string, status: 'active' | 'past', limit: number, cursor?: string) {
    const rows = await prisma.rideRequest.findMany({
      where: { passengerId: userId, status: status === 'active' ? { in: ACTIVE } : { in: ['CANCELLED', 'EXPIRED'] } },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map((r) => toDto(r, 'passenger')), nextCursor };
  },

  /** Haydovchilar uchun ochiq so'rovlar (viloyat bo'yicha filtr). */
  async listOpen(userId: string, q: OpenRideRequestsQuery) {
    await getApprovedDriver(userId);
    const [fromIds, toIds] = await Promise.all([
      q.from ? cityIds(q.from, false) : undefined,
      q.to ? cityIds(q.to, false) : undefined,
    ]);
    const day = q.date ? tashkentToUtc(q.date) : null;
    const rows = await prisma.rideRequest.findMany({
      where: {
        status: 'OPEN',
        passengerId: { not: userId },
        passenger: { isBlocked: false },
        date: day ? { gte: day, lt: new Date(day.getTime() + DAY_MS) } : { gte: todayStart() },
        ...(fromIds ? { fromCityId: { in: fromIds } } : {}),
        ...(toIds ? { toCityId: { in: toIds } } : {}),
      },
      include,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return { items: items.map((r) => toDto(r, 'public')), nextCursor };
  },

  /** Haydovchiga biriktirilgan so'rovlar (yo'lovchi kontakti bilan). */
  async listAssigned(userId: string, limit: number, cursor?: string) {
    const profile = await getDriverProfile(userId);
    const rows = await prisma.rideRequest.findMany({
      where: { driverId: profile.id, status: 'ASSIGNED', date: { gte: new Date(todayStart().getTime() - 15 * DAY_MS) } },
      include,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map((r) => toDto(r, 'driver')), nextCursor };
  },

  async take(userId: string, id: string, pricePerSeat: number, vehicleId?: string) {
    const r = await takeAsDriver(userId, id, pricePerSeat, vehicleId);
    return { request: toDto(r, 'driver'), passengerId: r.passengerId, toPassenger: assignedPayload(r), toDriver: passengerPayload(r) };
  },

  /** Yo'lovchi bekor qiladi (OPEN yoki ASSIGNED). Biriktirilgan haydovchiga xabar boradi. */
  async cancel(userId: string, id: string) {
    const r = await load(id);
    if (r.passengerId !== userId) throw new AppError('RIDE_REQUEST_NOT_FOUND');
    await setStatus(r, 'CANCELLED');
    return { request: toDto(await load(id), 'passenger'), driverUserId: r.driver?.userId ?? null };
  },

  // ── Admin ──

  async adminList(q: { status?: RideRequestStatus; limit: number; cursor?: string }) {
    const rows = await prisma.rideRequest.findMany({
      where: q.status ? { status: q.status } : {},
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    return { items: items.map((r) => toDto(r, 'admin')), nextCursor };
  },

  /** Admin tizimda bo'lmagan haydovchini qo'lda biriktiradi (masalan, guruhda kelishilgan). */
  async adminAssign(adminId: string, id: string, data: AssignRideRequestBody) {
    const r = await load(id);
    assertOpen(r);
    const res = await prisma.rideRequest.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: 'ASSIGNED',
        driverId: null,
        vehicleId: null,
        pricePerSeat: data.pricePerSeat,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        driverTelegram: null,
        carModel: data.carModel,
        carColor: data.carColor ?? null,
        carPlate: data.carPlate ?? null,
        assignedAt: new Date(),
        assignedById: adminId,
      },
    });
    if (res.count === 0) throw new AppError('RIDE_REQUEST_NOT_OPEN');
    const updated = await load(id);
    return { request: toDto(updated, 'admin'), passengerId: updated.passengerId, toPassenger: assignedPayload(updated) };
  },

  async adminCancel(id: string) {
    const r = await load(id);
    await setStatus(r, 'CANCELLED');
    return { request: toDto(await load(id), 'admin'), passengerId: r.passengerId, driverUserId: r.driver?.userId ?? null };
  },

  // ── Bot (ichki API) ──

  /** "Olaman" bosilganda: haydovchi va so'rov tekshiriladi, narx so'rash uchun qisqa ma'lumot qaytadi. */
  async botCheck(telegramId: string, id: string) {
    const userId = await userIdByTelegram(telegramId);
    const profile = await getApprovedDriver(userId);
    await assertDriverSubscription(profile);
    const hasVehicle = await prisma.vehicle.count({ where: { driverId: profile.id, status: 'APPROVED' } });
    if (!hasVehicle) throw new AppError('VEHICLE_NOT_APPROVED');
    const r = await load(id);
    if (r.passengerId === userId) throw new AppError('CANNOT_TAKE_OWN_REQUEST');
    assertOpen(r);
    return summary(r);
  },

  async botTake(telegramId: string, id: string, pricePerSeat: number) {
    const userId = await userIdByTelegram(telegramId);
    const r = await takeAsDriver(userId, id, pricePerSeat);
    return { passengerId: r.passengerId, toPassenger: assignedPayload(r), toDriver: passengerPayload(r) };
  },

  /**
   * Guruh navbati: toPost — haydovchilar belgilangan vaqtda olmagan (yoki mos haydovchi bo'lmagan) ochiq so'rovlar;
   * toClose — guruhga tashlangan, lekin endi ochiq bo'lmagan so'rovlar (post "olindi" deb yangilanadi).
   */
  async groupQueue(now = Date.now()) {
    const cutoff = new Date(now - env.RIDE_REQUEST_GROUP_DELAY_MIN * 60_000);
    const [toPost, toClose] = await Promise.all([
      prisma.rideRequest.findMany({
        where: {
          status: 'OPEN',
          groupPostedAt: null,
          date: { gte: todayStart(now) },
          passenger: { isBlocked: false },
          OR: [{ notifiedDrivers: 0 }, { createdAt: { lte: cutoff } }],
        },
        include,
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
      prisma.rideRequest.findMany({
        where: { groupMessageId: { not: null }, groupClosedAt: null, status: { not: 'OPEN' } },
        select: { id: true, status: true, groupChatId: true, groupMessageId: true },
        take: 20,
      }),
    ]);
    return {
      toPost: toPost.map((r) => summary(r)),
      toClose: toClose.map((r) => ({ requestId: r.id, status: r.status, chatId: r.groupChatId!, messageId: r.groupMessageId! })),
    };
  },

  async groupPosted(id: string, chatId: string, messageId: number) {
    const res = await prisma.rideRequest.updateMany({
      where: { id, groupPostedAt: null },
      data: { groupPostedAt: new Date(), groupChatId: chatId, groupMessageId: messageId },
    });
    return { updated: res.count };
  },

  async groupClosed(id: string) {
    const res = await prisma.rideRequest.updateMany({ where: { id, groupClosedAt: null }, data: { groupClosedAt: new Date() } });
    return { updated: res.count };
  },
};

/** Cron: sanasi o'tgan ochiq so'rovlar EXPIRED bo'ladi. Yo'lovchilarga xabar beriladi. */
export async function expireRideRequests(now = Date.now()) {
  const rows = await prisma.rideRequest.findMany({
    where: { status: 'OPEN', date: { lt: todayStart(now) } },
    select: { id: true, passengerId: true },
    take: 500,
  });
  const expired: { id: string; passengerId: string }[] = [];
  for (const r of rows) {
    const res = await prisma.rideRequest.updateMany({ where: { id: r.id, status: 'OPEN' }, data: { status: 'EXPIRED' } });
    if (res.count) expired.push(r);
  }
  return expired;
}
