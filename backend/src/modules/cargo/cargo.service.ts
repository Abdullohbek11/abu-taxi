import { Prisma, type CargoOffer, type CargoRequest, type CargoStatus, type OfferStatus } from '@prisma/client';
import { toContact } from '../../lib/contact.js';
import { AppError } from '../../lib/errors.js';
import { photoList } from '../../lib/format.js';
import { imageKey, processImage } from '../../lib/images.js';
import { paginate } from '../../lib/pagination.js';
import { prisma, transaction, type Tx } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { assertTransition } from '../../lib/stateMachine.js';
import { DAY_MS, tashkentToUtc } from '../../lib/time.js';
import { getApprovedDriver, getDriverProfile } from '../drivers/drivers.service.js';
import { assertCities, cityIds } from '../trips/trips.service.js';
import { clientRatingSelect, toPublicUserDto } from '../users/users.service.js';
import { assertDriverSubscription } from '../billing/billing.service.js';
import type { CreateCargoBody, OpenCargoQuery } from './cargo.schema.js';
import { CARGO_TRANSITIONS, OFFER_TRANSITIONS } from './cargo.state.js';

export const MAX_CARGO_PHOTOS = 5;
/** Spam so'rovlarga qarshi */
export const MAX_OPEN_CARGO = 10;
const ACTIVE_CARGO: CargoStatus[] = ['OPEN', 'MATCHED', 'IN_TRANSIT'];

const citySelect = { id: true, nameUz: true, nameRu: true, region: true } satisfies Prisma.CitySelect;
const contactUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  phone: true,
  telegramUsername: true,
} satisfies Prisma.UserSelect;

const cargoInclude = {
  fromCity: { select: citySelect },
  toCity: { select: citySelect },
  sender: { select: { ...contactUserSelect, ...clientRatingSelect } },
  offers: {
    where: { status: 'ACCEPTED' },
    include: { driver: { include: { user: { select: contactUserSelect } } } },
  },
  _count: { select: { offers: { where: { status: 'PENDING' } } } },
  reviews: { select: { authorId: true } },
} satisfies Prisma.CargoRequestInclude;

type CargoWithRelations = Prisma.CargoRequestGetPayload<{ include: typeof cargoInclude }>;

/**
 * Yuk ko'rinishi. Kontakt faqat taklif ACCEPTED bo'lganda:
 * jo'natuvchi haydovchinikini, qabul qilingan haydovchi jo'natuvchinikini ko'radi.
 */
function toCargoDto(c: CargoWithRelations, viewerId: string | null) {
  const accepted = c.offers[0] ?? null;
  const isSender = viewerId === c.sender.id;
  const isAcceptedDriver = !!accepted && viewerId === accepted.driver.user.id;
  return {
    id: c.id,
    type: c.type,
    weightKg: c.weightKg,
    lengthCm: c.lengthCm,
    widthCm: c.widthCm,
    heightCm: c.heightCm,
    photos: photoList(c.photos),
    from: c.fromCity,
    to: c.toCity,
    pickupAddress: c.pickupAddress,
    dropoffAddress: c.dropoffAddress,
    // Xaritadagi aniq nuqtalar — faqat jo'natuvchi va qabul qilingan haydovchiga
    location:
      isSender || isAcceptedDriver
        ? { pickupLat: c.pickupLat, pickupLng: c.pickupLng, dropoffLat: c.dropoffLat, dropoffLng: c.dropoffLng }
        : null,
    date: c.date,
    offeredPrice: c.offeredPrice,
    description: c.description,
    status: c.status,
    createdAt: c.createdAt,
    sender: toPublicUserDto(c.sender),
    pendingOffers: c._count.offers,
    acceptedOffer:
      accepted && (isSender || isAcceptedDriver)
        ? { id: accepted.id, price: accepted.price, driver: toPublicUserDto(accepted.driver.user) }
        : null,
    contact: isSender && accepted ? toContact(accepted.driver.user) : isAcceptedDriver ? toContact(c.sender) : null,
    reviewed: !!viewerId && c.reviews.some((r) => r.authorId === viewerId),
  };
}

async function loadCargo(id: string, viewerId: string | null) {
  const c = await prisma.cargoRequest.findUnique({ where: { id }, include: cargoInclude });
  if (!c) throw new AppError('CARGO_NOT_FOUND');
  return toCargoDto(c, viewerId);
}

async function transitionCargo(tx: Tx, c: Pick<CargoRequest, 'id' | 'status'>, to: CargoStatus) {
  assertTransition(CARGO_TRANSITIONS, c.status, to);
  const res = await tx.cargoRequest.updateMany({
    where: { id: c.id, status: c.status },
    data: { status: to, ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}) },
  });
  if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
}

async function transitionOffer(tx: Tx, o: Pick<CargoOffer, 'id' | 'status'>, to: OfferStatus) {
  assertTransition(OFFER_TRANSITIONS, o.status, to);
  const res = await tx.cargoOffer.updateMany({ where: { id: o.id, status: o.status }, data: { status: to } });
  if (res.count === 0) throw new AppError('INVALID_STATE_TRANSITION');
}

const offerInclude = {
  driver: {
    include: {
      user: { select: contactUserSelect },
      vehicles: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  },
  trip: { select: { id: true, departureAt: true, status: true } },
} satisfies Prisma.CargoOfferInclude;

function toOfferDto(o: Prisma.CargoOfferGetPayload<{ include: typeof offerInclude }>, showContact: boolean) {
  const v = o.driver.vehicles[0];
  return {
    id: o.id,
    cargoRequestId: o.cargoRequestId,
    price: o.price,
    message: o.message,
    status: o.status,
    createdAt: o.createdAt,
    trip: o.trip,
    driver: {
      ...toPublicUserDto(o.driver.user),
      rating: Number(o.driver.ratingAvg),
      ratingCount: o.driver.ratingCount,
      tripsCount: o.driver.tripsCount,
      vehicle: v ? { model: v.model, color: v.color, acceptsCargo: v.acceptsCargo } : null,
    },
    contact: showContact && o.status === 'ACCEPTED' ? toContact(o.driver.user) : null,
  };
}

async function loadOffer(id: string) {
  const offer = await prisma.cargoOffer.findUnique({ where: { id }, include: { cargoRequest: true, driver: true } });
  if (!offer) throw new AppError('OFFER_NOT_FOUND');
  return offer;
}

export const cargoService = {
  async create(userId: string, data: CreateCargoBody, photos: Buffer[]) {
    if (photos.length > MAX_CARGO_PHOTOS) throw new AppError('CARGO_PHOTOS_LIMIT');
    await assertCities(data.fromCityId, data.toCityId);
    const open = await prisma.cargoRequest.count({ where: { senderId: userId, status: { in: ACTIVE_CARGO } } });
    if (open >= MAX_OPEN_CARGO) throw new AppError('TOO_MANY_OPEN_CARGO');
    const date = tashkentToUtc(data.date);
    if (date.getTime() + DAY_MS <= Date.now()) throw new AppError('CARGO_DATE_IN_PAST');

    const urls = await Promise.all(
      photos.map(async (p) => storage.putPublic(imageKey(`cargo/${userId}`), await processImage(p), 'image/webp')),
    );
    const cargo = await prisma.cargoRequest.create({ data: { ...data, date, photos: urls, senderId: userId } });
    return loadCargo(cargo.id, userId);
  },

  async listMine(userId: string, status: 'active' | 'past', limit: number, cursor?: string) {
    const rows = await prisma.cargoRequest.findMany({
      where: { senderId: userId, status: status === 'active' ? { in: ACTIVE_CARGO } : { in: ['DELIVERED', 'CANCELLED'] } },
      include: cargoInclude,
      // Taklif kutayotgan (OPEN) yuklar tepada
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return { items: items.map((c) => toCargoDto(c, userId)), nextCursor };
  },

  /** Haydovchilar uchun ochiq so'rovlar (o'ziniki ko'rinmaydi). */
  async listOpen(userId: string, q: OpenCargoQuery) {
    await getApprovedDriver(userId);
    const [fromIds, toIds] = await Promise.all([
      q.from ? cityIds(q.from, false) : undefined,
      q.to ? cityIds(q.to, false) : undefined,
    ]);
    const where: Prisma.CargoRequestWhereInput = {
      status: 'OPEN',
      senderId: { not: userId },
      sender: { isBlocked: false },
      date: q.date ? { gte: tashkentToUtc(q.date), lt: new Date(tashkentToUtc(q.date).getTime() + DAY_MS) } : { gte: new Date(Date.now() - DAY_MS) },
      ...(fromIds ? { fromCityId: { in: fromIds } } : {}),
      ...(toIds ? { toCityId: { in: toIds } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.maxWeightKg ? { weightKg: { lte: q.maxWeightKg } } : {}),
    };
    const rows = await prisma.cargoRequest.findMany({
      where,
      include: cargoInclude,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, q.limit);
    // Haydovchi bu yukka allaqachon taklif berganmi — tugma o'rniga uning narxi ko'rsatiladi
    const mine = await prisma.cargoOffer.findMany({
      where: { cargoRequestId: { in: items.map((c) => c.id) }, driver: { userId }, status: { in: ['PENDING', 'ACCEPTED'] } },
      select: { cargoRequestId: true, price: true, status: true },
    });
    const byCargo = new Map(mine.map((o) => [o.cargoRequestId, { price: o.price, status: o.status }]));
    return { items: items.map((c) => ({ ...toCargoDto(c, userId), myOffer: byCargo.get(c.id) ?? null })), nextCursor };
  },

  /**
   * Ko'rish: egasi va admin — har doim; haydovchi — faqat ochiq so'rovni yoki o'zi taklif bergan so'rovni
   * (yopilgan yukning manzillari begona haydovchilarga ko'rinmaydi).
   */
  async getById(id: string, viewer: { id: string; role: string | null }) {
    const dto = await loadCargo(id, viewer.id);
    if (dto.sender.id === viewer.id || viewer.role === 'ADMIN') return dto;
    if (viewer.role === 'DRIVER') {
      if (dto.status === 'OPEN') return dto;
      const offered = await prisma.cargoOffer.count({ where: { cargoRequestId: id, driver: { userId: viewer.id } } });
      if (offered > 0) return dto;
    }
    throw new AppError('CARGO_NOT_FOUND');
  },

  async cancel(userId: string, id: string) {
    const cargo = await prisma.cargoRequest.findUnique({ where: { id } });
    if (!cargo || cargo.senderId !== userId) throw new AppError('CARGO_NOT_FOUND');
    const affected = await prisma.cargoOffer.findMany({
      where: { cargoRequestId: id, status: { in: ['PENDING', 'ACCEPTED'] } },
      include: { driver: { select: { userId: true } } },
    });
    await transaction(async (tx) => {
      await transitionCargo(tx, cargo, 'CANCELLED');
      await tx.cargoOffer.updateMany({ where: { cargoRequestId: id, status: 'PENDING' }, data: { status: 'REJECTED' } });
    });
    return { cargo: await loadCargo(id, userId), driverUserIds: affected.map((o) => o.driver.userId) };
  },

  async createOffer(userId: string, cargoId: string, data: { price: number; message?: string; tripId?: string }) {
    const profile = await getApprovedDriver(userId);
    await assertDriverSubscription(profile);
    const cargo = await prisma.cargoRequest.findUnique({ where: { id: cargoId } });
    if (!cargo) throw new AppError('CARGO_NOT_FOUND');
    if (cargo.senderId === userId) throw new AppError('CANNOT_OFFER_OWN_CARGO');
    if (cargo.status !== 'OPEN') throw new AppError('CARGO_NOT_OPEN');

    if (data.tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: data.tripId } });
      if (!trip || trip.driverId !== profile.id || trip.status !== 'SCHEDULED') throw new AppError('TRIP_NOT_FOUND');
      if (!trip.acceptsCargo) throw new AppError('TRIP_NOT_ACCEPTING_CARGO');
    }

    // Yuk qatorini qulflab tekshiramiz: parallel so'rovlarda ham bitta haydovchi — bitta faol taklif,
    // va qabul qilish bilan bir vaqtda yopilgan yukka taklif yozilmaydi
    const offerId = await transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM CargoRequest WHERE id = ${cargoId} FOR UPDATE`;
      if (locked?.status !== 'OPEN') throw new AppError('CARGO_NOT_OPEN');
      const existing = await tx.cargoOffer.count({ where: { cargoRequestId: cargoId, driverId: profile.id, status: 'PENDING' } });
      if (existing > 0) throw new AppError('OFFER_ALREADY_EXISTS');
      return (await tx.cargoOffer.create({ data: { ...data, cargoRequestId: cargoId, driverId: profile.id } })).id;
    });
    const full = await prisma.cargoOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    return { offer: toOfferDto(full, false), senderId: cargo.senderId };
  },

  /** Haydovchining o'z takliflari (yuk ma'lumoti bilan; kontakt — faqat ACCEPTED). */
  async listMyOffers(userId: string, status: 'active' | 'past', limit: number, cursor?: string) {
    const profile = await getDriverProfile(userId);
    const rows = await prisma.cargoOffer.findMany({
      where: {
        driverId: profile.id,
        ...(status === 'active'
          ? { OR: [{ status: 'PENDING' }, { status: 'ACCEPTED', cargoRequest: { status: { in: ['MATCHED', 'IN_TRANSIT'] } } }] }
          : { NOT: { OR: [{ status: 'PENDING' }, { status: 'ACCEPTED', cargoRequest: { status: { in: ['MATCHED', 'IN_TRANSIT'] } } }] } }),
      },
      include: { ...offerInclude, cargoRequest: { include: cargoInclude } },
      // Javob kutayotgan (PENDING) takliflar tepada
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, limit);
    return {
      items: items.map((o) => ({ ...toOfferDto(o, false), cargo: toCargoDto(o.cargoRequest, userId) })),
      nextCursor,
    };
  },

  async listOffers(userId: string, cargoId: string) {
    const cargo = await prisma.cargoRequest.findUnique({ where: { id: cargoId } });
    if (!cargo || cargo.senderId !== userId) throw new AppError('CARGO_NOT_FOUND');
    const offers = await prisma.cargoOffer.findMany({
      where: { cargoRequestId: cargoId },
      include: offerInclude,
      orderBy: [{ status: 'asc' }, { price: 'asc' }, { createdAt: 'asc' }],
    });
    return offers.map((o) => toOfferDto(o, true));
  },

  /**
   * Taklifni qabul qilish (yuk egasi). Bitta tranzaksiyada: taklif ACCEPTED,
   * yuk MATCHED, qolgan takliflar REJECTED. Ikki parallel qabul — bittasi 409 oladi.
   */
  async acceptOffer(userId: string, offerId: string) {
    const offer = await loadOffer(offerId);
    if (offer.cargoRequest.senderId !== userId) throw new AppError('OFFER_NOT_FOUND');

    const others = await prisma.cargoOffer.findMany({
      where: { cargoRequestId: offer.cargoRequestId, status: 'PENDING', id: { not: offerId } },
      include: { driver: { select: { userId: true } } },
    });
    try {
      await transaction(async (tx) => {
        await transitionCargo(tx, offer.cargoRequest, 'MATCHED');
        await transitionOffer(tx, offer, 'ACCEPTED');
        await tx.cargoOffer.updateMany({
          where: { cargoRequestId: offer.cargoRequestId, status: 'PENDING', id: { not: offerId } },
          data: { status: 'REJECTED' },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError('INVALID_STATE_TRANSITION');
      throw err;
    }
    const full = await prisma.cargoOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    return {
      offer: toOfferDto(full, true),
      driverUserId: offer.driver.userId,
      rejectedDriverUserIds: others.map((o) => o.driver.userId),
    };
  },

  async rejectOffer(userId: string, offerId: string) {
    const offer = await loadOffer(offerId);
    if (offer.cargoRequest.senderId !== userId) throw new AppError('OFFER_NOT_FOUND');
    await transaction((tx) => transitionOffer(tx, offer, 'REJECTED'));
    const full = await prisma.cargoOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    return { offer: toOfferDto(full, true), driverUserId: offer.driver.userId };
  },

  async withdrawOffer(userId: string, offerId: string) {
    const offer = await loadOffer(offerId);
    if (offer.driver.userId !== userId) throw new AppError('OFFER_NOT_FOUND');
    await transaction((tx) => transitionOffer(tx, offer, 'WITHDRAWN'));
    const full = await prisma.cargoOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    return { offer: toOfferDto(full, false), senderId: offer.cargoRequest.senderId };
  },

  /**
   * Yetkazish holati: IN_TRANSIT — faqat qabul qilingan haydovchi;
   * DELIVERED — haydovchi yoki jo'natuvchi.
   */
  async setStatus(userId: string, cargoId: string, to: 'IN_TRANSIT' | 'DELIVERED') {
    const cargo = await prisma.cargoRequest.findUnique({
      where: { id: cargoId },
      include: { offers: { where: { status: 'ACCEPTED' }, include: { driver: true } } },
    });
    if (!cargo) throw new AppError('CARGO_NOT_FOUND');
    const driverUserId = cargo.offers[0]?.driver.userId;
    const isDriver = driverUserId === userId;
    const isSender = cargo.senderId === userId;
    if (!isDriver && !(isSender && to === 'DELIVERED')) {
      if (!isSender) throw new AppError('CARGO_NOT_FOUND');
      throw new AppError('FORBIDDEN');
    }
    await transaction((tx) => transitionCargo(tx, cargo, to));
    return {
      cargo: await loadCargo(cargoId, userId),
      counterpartUserId: isDriver ? cargo.senderId : driverUserId ?? null,
    };
  },
};
