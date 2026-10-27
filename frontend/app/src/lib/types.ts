/** Backend DTO'lari (backend/src/modules/* dagi to*Dto funksiyalari bilan mos). */
export type Role = 'PASSENGER' | 'SENDER' | 'DRIVER' | 'ADMIN';
export type Lang = 'UZ' | 'RU';

export interface Me {
  id: string;
  phone: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: Role | null;
  lang: Lang;
  isBlocked: boolean;
  blockReason?: string | null;
  createdAt: string;
  driverProfile?: { id: string; status: DriverStatus; rejectReason: string | null } | null;
}

export interface City {
  id: string;
  nameUz: string;
  nameRu: string;
  region: string;
}

export interface PublicUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Mijoz (yo'lovchi / yuk egasi) reytingi — haydovchiga ko'rsatiladi; null = hali baho yo'q */
  clientRating?: { avg: number; count: number } | null;
}

export interface RatingSummary {
  avg: number;
  count: number;
  distribution: { stars: number; count: number }[];
}

/** GET /users/:id/public */
export interface PublicProfile extends PublicUser {
  role: Role | null;
  memberSince: string;
  driverRating: RatingSummary | null;
  clientRating: RatingSummary | null;
  passenger: { completedTrips: number; lateCancellations: number };
  driver: { tripsCount: number; vehicles: { id: string; model: string; color: string; plateNumber: string; seats: number; photos: string[] }[] } | null;
  reviews: Review[];
}

export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type DriverStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Trip {
  id: string;
  from: City;
  to: City;
  departureAt: string;
  totalSeats: number;
  availableSeats: number;
  /** Eng arzon o'rin narxi */
  pricePerSeat: number;
  /** Har bir o'rin narxi (1-o'rin — old o'rin) */
  seatPrices: number[];
  pickupFromHome: boolean;
  acceptsCargo: boolean;
  note: string | null;
  status: TripStatus;
  createdAt: string;
  driver: PublicUser & { rating: number; ratingCount: number; tripsCount: number };
  vehicle: { id: string; model: string; color: string; plateNumber: string; seats: number; photos: string[] };
}

export interface Contact {
  phone: string | null;
  telegramUsername: string | null;
}

export interface Review {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  role?: 'DRIVER' | 'CLIENT';
  author: PublicUser;
  route?: { from: Pick<City, 'nameUz' | 'nameRu'>; to: Pick<City, 'nameUz' | 'nameRu'> } | null;
}

export interface BookingBase {
  id: string;
  tripId: string;
  seats: number;
  seatNumbers: number[];
  totalPrice: number;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  comment: string | null;
  status: BookingStatus;
  cancelledAt: string | null;
  cancelledLate: boolean;
  createdAt: string;
  contact: Contact | null;
  /** Joriy foydalanuvchi bu bron uchun baho qo'yganmi */
  reviewed?: boolean;
}

export interface PassengerBooking extends BookingBase {
  trip: Trip;
}

export interface DriverBooking extends BookingBase {
  passenger: PublicUser;
}

/** Haydovchi kabineti tepasidagi kutilayotgan so'rov */
export interface PendingDriverBooking extends BookingBase {
  passenger: PublicUser;
  trip: { id: string; from: City; to: City; departureAt: string };
}

export interface TripDetail extends Trip {
  /** Faol band qilishlar egallagan o'rinlar (joriy foydalanuvchiniki ham) */
  takenSeats: number[];
  driverReviews: Review[];
  myBooking: (BookingBase & { fullPlateNumber: string | null }) | null;
}

export interface Vehicle {
  id: string;
  model: string;
  color: string;
  plateNumber: string;
  seats: number;
  photos: string[];
  acceptsCargo: boolean;
  status: DriverStatus;
}

export interface DriverDocument {
  id: string;
  type: 'LICENSE' | 'TECH_PASSPORT' | 'CAR_PHOTO';
  status: DriverStatus;
  createdAt: string;
  url?: string;
}

export interface DriverProfile {
  id: string;
  /** Pullik tarif: shu vaqtgacha yo'lovchi oladi */
  subscriptionUntil?: string | null;
  status: DriverStatus;
  rejectReason: string | null;
  ratingAvg: number;
  ratingCount: number;
  tripsCount: number;
  vehicles: Vehicle[];
  documents: DriverDocument[];
}

export interface DriverTrip extends Trip {
  pendingBookings: number;
}

export interface DriverStats {
  today: { date: string; trips: (Trip & { bookedSeats: number })[] };
  weeklyEarnings: { date: string; passengers: number; cargo: number; total: number }[];
  weeklyTotal: number;
  trips: { scheduled: number; inProgress: number; completed: number; cancelled: number; total: number };
  rating: { avg: number; count: number };
}

export interface Notification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export type CargoType = 'FURNITURE' | 'APPLIANCE' | 'FOOD' | 'CONSTRUCTION' | 'OTHER';
export type CargoStatus = 'OPEN' | 'MATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Cargo {
  id: string;
  /** Haydovchiga: shu yukka bergan faol taklifi */
  myOffer?: { price: number; status: string } | null;
  reviewed?: boolean;
  type: CargoType;
  weightKg: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  photos: string[];
  from: City;
  to: City;
  pickupAddress: string;
  dropoffAddress: string;
  /** Xaritadagi nuqtalar — faqat jo'natuvchi va qabul qilingan haydovchiga */
  location: { pickupLat: number | null; pickupLng: number | null; dropoffLat: number | null; dropoffLng: number | null } | null;
  date: string;
  offeredPrice: number | null;
  description: string | null;
  status: CargoStatus;
  createdAt: string;
  sender: PublicUser;
  pendingOffers: number;
  acceptedOffer: { id: string; price: number; driver: PublicUser } | null;
  contact: Contact | null;
}

export interface CargoOffer {
  id: string;
  cargoRequestId: string;
  price: number;
  message: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
  driver: PublicUser & { rating: number; ratingCount: number; tripsCount: number; vehicle: { model: string; color: string } | null };
  contact: Contact | null;
  cargo?: Cargo;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type RideRequestStatus = 'OPEN' | 'ASSIGNED' | 'CANCELLED' | 'EXPIRED';

/** Safar topilmaganda yo'lovchi qoldirgan so'rov (backend: rideRequests.service toDto). */
export interface RideRequest {
  id: string;
  from: City;
  to: City;
  /** Toshkent kunining boshi (UTC) */
  date: string;
  seats: number;
  offeredPrice: number | null;
  note: string | null;
  status: RideRequestStatus;
  createdAt: string;
  passenger: PublicUser;
  /** Yo'lovchiga: biriktirilgan haydovchi (faqat ASSIGNED) */
  assignment?: {
    driverName: string | null;
    phone: string | null;
    telegramUsername: string | null;
    carModel: string | null;
    carColor: string | null;
    carPlate: string | null;
    pricePerSeat: number | null;
    assignedAt: string | null;
  } | null;
  pricePerSeat?: number | null;
  /** Haydovchiga (biriktirilgandan keyin) va adminga */
  passengerContact?: (Contact & { name: string }) | null;
  /** Safar kuni kelgan va hali baho qo'yilmagan */
  canReview?: boolean;
  /** Yo'lovchiga: biriktirilgan haydovchi profili (tizimdagi haydovchi bo'lsa) */
  driverUserId?: string | null;
  /** Faqat admin */
  notifiedDrivers?: number;
  groupPostedAt?: string | null;
  manual?: boolean;
}

export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type PaymentMethod = 'CARD' | 'PAYME' | 'CLICK' | 'ADMIN';

export interface Payment {
  id: string;
  amount: number;
  days: number;
  method: PaymentMethod;
  status: PaymentStatus;
  note: string | null;
  rejectReason: string | null;
  hasReceipt: boolean;
  periodFrom: string | null;
  periodUntil: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** GET /billing/plan — haydovchi tarifi */
export interface BillingPlan {
  enabled: boolean;
  price: number;
  days: number;
  card: { number: string; holder: string } | null;
  telegramUsername: string | null;
  providers: { payme: boolean; click: boolean };
  subscription: { active: boolean; until: string | null };
  payments: Payment[];
}

export interface BillingSettings {
  enabled: boolean;
  price: number;
  days: number;
  trialDays: number;
  cardNumber: string;
  cardHolder: string;
  telegramUsername: string;
  paymeMerchantId: string;
  clickServiceId: string;
  clickMerchantId: string;
}

export interface AdminPayment extends Payment {
  user: { id: string; phone: string | null; name: string; telegramUsername: string | null; subscriptionUntil: string | null };
}
