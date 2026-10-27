import type { Prisma } from '@prisma/client';
import { maskPlate, photoList } from '../../lib/format.js';
import { toPublicUserDto } from '../users/users.service.js';
import { seatPriceList } from './seats.js';

const citySelect = { id: true, nameUz: true, nameRu: true, region: true } satisfies Prisma.CitySelect;

export const tripInclude = {
  fromCity: { select: citySelect },
  toCity: { select: citySelect },
  vehicle: true,
  driver: {
    include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  },
} satisfies Prisma.TripInclude;

export type TripWithRelations = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

/**
 * Ommaviy safar ko'rinishi. Davlat raqami maskalangan;
 * to'liq raqam va telefon faqat tasdiqlangan band qilishda ochiladi.
 */
export function toTripDto(trip: TripWithRelations, opts: { fullPlate?: boolean } = {}) {
  return {
    id: trip.id,
    from: trip.fromCity,
    to: trip.toCity,
    departureAt: trip.departureAt,
    totalSeats: trip.totalSeats,
    availableSeats: trip.availableSeats,
    pricePerSeat: trip.pricePerSeat,
    /** Har bir o'rin narxi (1-o'rin — old o'rin) */
    seatPrices: seatPriceList(trip),
    pickupFromHome: trip.pickupFromHome,
    acceptsCargo: trip.acceptsCargo,
    note: trip.note,
    status: trip.status,
    createdAt: trip.createdAt,
    driver: {
      ...toPublicUserDto(trip.driver.user),
      rating: Number(trip.driver.ratingAvg),
      ratingCount: trip.driver.ratingCount,
      tripsCount: trip.driver.tripsCount,
    },
    vehicle: {
      id: trip.vehicle.id,
      model: trip.vehicle.model,
      color: trip.vehicle.color,
      plateNumber: opts.fullPlate ? trip.vehicle.plateNumber : maskPlate(trip.vehicle.plateNumber),
      seats: trip.vehicle.seats,
      photos: photoList(trip.vehicle.photos),
    },
  };
}
