/**
 * Dev seed: bazani tozalab, frontend namunalariga mos ma'lumotlar yozadi.
 * Ishga tushirish: npm run seed
 */
import {
  BookingStatus,
  CargoStatus,
  CargoType,
  OfferStatus,
  Prisma,
  PrismaClient,
  Role,
  TripStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// ── Deterministik tasodif (har safar bir xil natija) ──
let seedState = 20260930;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

/** Toshkent vaqti (UTC+5) bo'yicha sana → UTC Date */
function tashkent(daysFromToday: number, hour: number, minute = 0): Date {
  const now = new Date();
  const local = new Date(now.getTime() + 5 * 3600_000);
  const d = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysFromToday, hour - 5, minute);
  return new Date(d);
}

// ── Shaharlar ──
const ANDIJON_REGION = 'Andijon viloyati';
const TOSHKENT_REGION = 'Toshkent shahri';

const CITIES: { nameUz: string; nameRu: string; region: string }[] = [
  { nameUz: 'Andijon', nameRu: 'Андижан', region: ANDIJON_REGION },
  { nameUz: 'Andijon tumani', nameRu: 'Андижанский район', region: ANDIJON_REGION },
  { nameUz: 'Asaka', nameRu: 'Асака', region: ANDIJON_REGION },
  { nameUz: 'Baliqchi', nameRu: 'Балыкчи', region: ANDIJON_REGION },
  { nameUz: "Bo'ston", nameRu: 'Бустон', region: ANDIJON_REGION },
  { nameUz: 'Buloqboshi', nameRu: 'Булакбаши', region: ANDIJON_REGION },
  { nameUz: 'Izboskan', nameRu: 'Избаскан', region: ANDIJON_REGION },
  { nameUz: 'Jalaquduq', nameRu: 'Джалакудук', region: ANDIJON_REGION },
  { nameUz: "Xo'jaobod", nameRu: 'Ходжаабад', region: ANDIJON_REGION },
  { nameUz: "Qo'rg'ontepa", nameRu: 'Кургантепа', region: ANDIJON_REGION },
  { nameUz: 'Marhamat', nameRu: 'Мархамат', region: ANDIJON_REGION },
  { nameUz: "Oltinko'l", nameRu: 'Алтынкуль', region: ANDIJON_REGION },
  { nameUz: 'Paxtaobod', nameRu: 'Пахтаабад', region: ANDIJON_REGION },
  { nameUz: 'Shahrixon', nameRu: 'Шахрихан', region: ANDIJON_REGION },
  { nameUz: "Ulug'nor", nameRu: 'Улугнор', region: ANDIJON_REGION },
  { nameUz: 'Xonobod', nameRu: 'Ханабад', region: ANDIJON_REGION },

  { nameUz: 'Toshkent', nameRu: 'Ташкент', region: TOSHKENT_REGION },
  { nameUz: 'Bektemir', nameRu: 'Бектемир', region: TOSHKENT_REGION },
  { nameUz: 'Chilonzor', nameRu: 'Чиланзар', region: TOSHKENT_REGION },
  { nameUz: 'Mirobod', nameRu: 'Мирабад', region: TOSHKENT_REGION },
  { nameUz: "Mirzo Ulug'bek", nameRu: 'Мирзо-Улугбек', region: TOSHKENT_REGION },
  { nameUz: 'Olmazor', nameRu: 'Алмазар', region: TOSHKENT_REGION },
  { nameUz: 'Sergeli', nameRu: 'Сергели', region: TOSHKENT_REGION },
  { nameUz: 'Shayxontohur', nameRu: 'Шайхантахур', region: TOSHKENT_REGION },
  { nameUz: 'Uchtepa', nameRu: 'Учтепа', region: TOSHKENT_REGION },
  { nameUz: 'Yakkasaroy', nameRu: 'Яккасарай', region: TOSHKENT_REGION },
  { nameUz: 'Yashnobod', nameRu: 'Яшнабад', region: TOSHKENT_REGION },
  { nameUz: 'Yunusobod', nameRu: 'Юнусабад', region: TOSHKENT_REGION },
  { nameUz: 'Yangihayot', nameRu: 'Янгихаёт', region: TOSHKENT_REGION },
];

// ── Haydovchilar (frontend: "Bahodir A. · Cobalt, oq · 01 A 7**", "Sardor R. · Labo, oq · 60 L 4**") ──
const DRIVERS = [
  { firstName: 'Bahodir', lastName: 'Aliyev', tg: 'bahodir_aliyev', car: { model: 'Chevrolet Cobalt', color: 'Oq', plate: '01 A 777 BA', seats: 4, cargo: false } },
  { firstName: 'Sardor', lastName: 'Rahimov', tg: 'sardor_labo', car: { model: 'Chevrolet Labo', color: 'Oq', plate: '60 L 412 SA', seats: 2, cargo: true } },
  { firstName: 'Jasur', lastName: 'Karimov', tg: 'jasur_k', car: { model: 'Chevrolet Gentra', color: 'Kumush', plate: '60 A 215 JK', seats: 4, cargo: false } },
  { firstName: 'Otabek', lastName: 'Yusupov', tg: null, car: { model: 'Chevrolet Nexia 3', color: 'Qora', plate: '60 B 330 OY', seats: 4, cargo: true } },
  { firstName: 'Dilshod', lastName: 'Nazarov', tg: 'dilshod_nazarov', car: { model: 'Chevrolet Malibu', color: 'Qora', plate: '01 M 100 DN', seats: 4, cargo: false } },
  { firstName: 'Sherzod', lastName: "To'xtasinov", tg: null, car: { model: 'Chevrolet Damas', color: 'Oq', plate: '60 D 557 ST', seats: 6, cargo: true } },
  { firstName: "Ulug'bek", lastName: 'Qodirov', tg: 'ulugbek_q', car: { model: 'Chevrolet Cobalt', color: 'Kulrang', plate: '60 C 808 UQ', seats: 4, cargo: false } },
  { firstName: 'Akmal', lastName: 'Ergashev', tg: 'akmal_e', car: { model: 'Chevrolet Gentra', color: 'Oq', plate: '01 G 432 AE', seats: 4, cargo: true } },
  { firstName: 'Farrux', lastName: 'Mirzayev', tg: null, car: { model: 'Chevrolet Nexia 3', color: 'Oq', plate: '60 N 919 FM', seats: 4, cargo: false } },
  { firstName: 'Rustam', lastName: 'Xolmatov', tg: 'rustam_labo', car: { model: 'Chevrolet Labo', color: 'Ko\'k', plate: '60 L 276 RX', seats: 2, cargo: true } },
] as const;

const PASSENGERS = [
  ['Nilufar', 'Tursunova'], ['Aziz', 'Rasulov'], ['Madina', 'Sobirova'], ['Behruz', 'Umarov'],
  ['Kamola', 'Ismoilova'], ['Sanjar', 'Hamidov'], ['Gulnoza', 'Abdullayeva'], ['Islom', 'Normatov'],
  ['Shahnoza', 'Qosimova'], ['Temur', 'Xasanov'], ['Zarina', 'Jo\'rayeva'], ['Doniyor', 'Saidov'],
] as const;

const SENDERS = [
  ['Mirjalol', 'Ahmedov'], ['Feruza', 'Olimova'], ['Anvar', 'Po\'latov'], ['Lola', 'Rustamova'], ['Botir', 'Hakimov'],
] as const;

const TRIP_NOTES = [
  'Konditsioner bor. Chekish mumkin emas.',
  "Katta sumkalar uchun joy bor.",
  "Yo'lda Qo'qonda 15 daqiqa to'xtaymiz.",
  'Uydan olib ketaman, manzilni yozing.',
  null,
  null,
];

const REVIEW_TEXTS = [
  "Juda madaniyatli haydovchi, vaqtida yetib keldik.",
  "Mashina toza, konditsioner ishlab turdi. Rahmat!",
  "Uydan olib ketdi, bekatga borishim shart bo'lmadi.",
  "Narx oldindan kelishilgandek bo'ldi, qo'shimcha so'ramadi.",
  "Tez va xavfsiz haydadi. Yana shu haydovchi bilan boraman.",
  "Hammasi yaxshi, faqat biroz kechikdi.",
];

const CARGO_SAMPLES: { type: CargoType; weightKg: number; dims?: [number, number, number]; description: string; price: number }[] = [
  { type: CargoType.FURNITURE, weightKg: 120, dims: [200, 90, 60], description: 'Divan, qadoqlangan', price: 400_000 },
  { type: CargoType.APPLIANCE, weightKg: 65, dims: [180, 70, 70], description: 'Muzlatkich Artel', price: 300_000 },
  { type: CargoType.FOOD, weightKg: 40, description: 'Anor, 4 quti', price: 120_000 },
  { type: CargoType.CONSTRUCTION, weightKg: 300, description: 'Kafel, 15 quti', price: 500_000 },
  { type: CargoType.OTHER, weightKg: 5, dims: [40, 30, 30], description: 'Posilka: hujjatlar va kiyim', price: 50_000 },
  { type: CargoType.APPLIANCE, weightKg: 30, dims: [60, 60, 85], description: 'Kir yuvish mashinasi', price: 200_000 },
  { type: CargoType.FOOD, weightKg: 80, description: "Qovun, 10 dona", price: 150_000 },
  { type: CargoType.FURNITURE, weightKg: 45, dims: [120, 60, 75], description: 'Yozuv stoli', price: 180_000 },
  { type: CargoType.OTHER, weightKg: 10, description: 'Posilka: sovg\'alar', price: 70_000 },
  { type: CargoType.CONSTRUCTION, weightKg: 150, description: 'Sement, 3 qop', price: 250_000 },
];

/** 14 hudud markazi: koordinata va avtoraqam kodi */
type Center = { name: string; lat: number; lng: number; plate: string };
const CENTERS: Center[] = [
  { name: 'Toshkent', lat: 41.2995, lng: 69.2401, plate: '01' },
  { name: 'Nurafshon', lat: 41.0167, lng: 69.35, plate: '10' },
  { name: 'Guliston', lat: 40.4897, lng: 68.7842, plate: '20' },
  { name: 'Jizzax', lat: 40.1158, lng: 67.8422, plate: '25' },
  { name: 'Samarqand', lat: 39.6542, lng: 66.9597, plate: '30' },
  { name: "Farg'ona", lat: 40.3864, lng: 71.7864, plate: '40' },
  { name: 'Namangan', lat: 40.9983, lng: 71.6726, plate: '50' },
  { name: 'Andijon', lat: 40.7821, lng: 72.3442, plate: '60' },
  { name: 'Qarshi', lat: 38.8606, lng: 65.7891, plate: '70' },
  { name: 'Termiz', lat: 37.2242, lng: 67.2783, plate: '75' },
  { name: 'Buxoro', lat: 39.7681, lng: 64.4556, plate: '80' },
  { name: 'Navoiy', lat: 40.0844, lng: 65.3792, plate: '85' },
  { name: 'Urganch', lat: 41.55, lng: 60.6333, plate: '90' },
  { name: 'Nukus', lat: 42.46, lng: 59.61, plate: '95' },
];

/** To'g'ri chiziq masofasi (km) */
function distanceKm(a: Center, b: Center): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Bir o'rin narxi: yo'l ≈ 1.25 × to'g'ri masofa, ~380 so'm/km, 10 000 ga yaxlitlangan, kamida 30 000 */
function routePrice(a: Center, b: Center): number {
  const base = Math.max(30_000, Math.round((distanceKm(a, b) * 1.25 * 380) / 10_000) * 10_000);
  return base + int(0, 2) * 10_000;
}

/** Markaz atrofida (≈3 km) tasodifiy nuqta — uy/manzil o'rniga */
function jitter(c: Center) {
  return { lat: +(c.lat + (rand() - 0.5) * 0.05).toFixed(6), lng: +(c.lng + (rand() - 0.5) * 0.05).toFixed(6) };
}

const STREETS = ["Mustaqillik ko'chasi", "Navoiy ko'chasi", "Amir Temur ko'chasi", "Bobur ko'chasi", 'markaziy bozor yonida', 'avtovokzal yonida', 'shahar hokimiyati oldida'];

const FIRST_NAMES = ['Abdulla', 'Bekzod', 'Davron', 'Elyor', 'Farhod', "G'ayrat", 'Hasan', 'Ilhom', 'Jahongir', 'Komil', 'Lochin', 'Mansur', 'Nodir', 'Oybek', "Po'lat", 'Rashid', 'Saidakbar', 'Tohir', 'Umid', 'Valijon', 'Xurshid', 'Yorqin', 'Zafar', 'Shuhrat', 'Shavkat', 'Murod', 'Baxtiyor', 'Alisher'];
const LAST_NAMES = ['Abdullayev', 'Boboyev', 'Davletov', 'Ergashev', 'Fayzullayev', "G'aniyev", 'Hamroyev', 'Ibragimov', 'Jumayev', 'Komilov', 'Latipov', 'Mahmudov', 'Nurmatov', 'Ortiqov', 'Qurbonov', 'Rajabov', 'Sultonov', "Toshpo'latov", 'Usmonov', 'Xudoyberdiyev'];
const CARS: { model: string; seats: number; cargo: boolean }[] = [
  { model: 'Chevrolet Cobalt', seats: 4, cargo: false },
  { model: 'Chevrolet Gentra', seats: 4, cargo: false },
  { model: 'Chevrolet Nexia 3', seats: 4, cargo: true },
  { model: 'Chevrolet Malibu', seats: 4, cargo: false },
  { model: 'Chevrolet Onix', seats: 4, cargo: false },
  { model: 'Chevrolet Tracker', seats: 4, cargo: true },
  { model: 'Chevrolet Damas', seats: 6, cargo: true },
  { model: 'Kia K5', seats: 4, cargo: false },
  { model: 'Hyundai Staria', seats: 7, cargo: true },
];
const COLORS = ['Oq', 'Qora', 'Kumush', 'Kulrang', "Ko'k", 'Qizil'];

async function reset() {
  // Bog'liqlik tartibida o'chirish
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.loginCode.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.review.deleteMany(),
    prisma.cargoOffer.deleteMany(),
    prisma.cargoRequest.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.document.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.driverProfile.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Seed production muhitida ishga tushirilmaydi");
  }

  await reset();

  // Shaharlar
  // Shaharlar migratsiya orqali kiritiladi (barqaror id); seed faqat yetishmaganini qo'shadi
  await prisma.city.createMany({ data: CITIES, skipDuplicates: true });
  const cities = await prisma.city.findMany();
  const cityId = (nameUz: string) => cities.find((c) => c.nameUz === nameUz)!.id;
  const regionOf = (id: string) => cities.find((c) => c.id === id)!.region;
  /** Ba'zan markaz o'rniga shu viloyatning boshqa shahri/tumani */
  const nearby = (mainId: string) => {
    const list = cities.filter((c) => c.region === regionOf(mainId)).map((c) => c.id);
    return rand() < 0.75 ? mainId : pick(list);
  };
  /** Yakunlangan safarlar va yuklar uchun tasodifiy yo'nalish (har xil hududlar) */
  const route = () => {
    const a = pick(CENTERS);
    let b = pick(CENTERS);
    while (b === a) b = pick(CENTERS);
    return { from: a, to: b, fromCityId: cityId(a.name), toCityId: cityId(b.name), price: routePrice(a, b) };
  };

  // Admin
  await prisma.user.create({
    data: { phone: '+998900000001', firstName: 'Admin', lastName: 'Abu Tax', role: Role.ADMIN, telegramUsername: 'abutax_uz' },
  });

  // Haydovchilar + mashinalar + hujjatlar
  // Asosiy 10 ta (Andijon/Toshkent) + har bir hududga 2 tadan
  const usedPlates = new Set<string>(DRIVERS.map((d) => d.car.plate));
  const extra = CENTERS.flatMap((c, ci) =>
    [0, 1].map((k) => {
      const car = pick(CARS);
      let plate = '';
      do plate = `${c.plate} ${pick(['A', 'B', 'C', 'D', 'K', 'M', 'N', 'S'])} ${String(int(100, 999))} ${pick(['AA', 'BB', 'DA', 'KM', 'SA', 'TT', 'UZ', 'XO'])}`;
      while (usedPlates.has(plate));
      usedPlates.add(plate);
      const firstName = FIRST_NAMES[(ci * 2 + k) % FIRST_NAMES.length]!;
      const lastName = LAST_NAMES[(ci * 3 + k) % LAST_NAMES.length]!;
      return {
        firstName,
        lastName,
        tg: rand() < 0.6 ? `${firstName.toLowerCase().replace(/[^a-z]/g, '')}_${c.plate}${k}` : null,
        car: { model: car.model, color: pick(COLORS), plate, seats: car.seats, cargo: car.cargo },
        home: c.name,
      };
    }),
  );
  const allDrivers = [...DRIVERS.map((d) => ({ ...d, home: d.car.plate.startsWith('01') ? 'Toshkent' : 'Andijon' })), ...extra];
  const drivers = [];
  for (const [i, d] of allDrivers.entries()) {
    const user = await prisma.user.create({
      data: {
        phone: `+99890111${String(i).padStart(4, '0')}`,
        firstName: d.firstName,
        lastName: d.lastName,
        telegramUsername: d.tg,
        role: Role.DRIVER,
        driverProfile: {
          create: {
            status: 'APPROVED',
            vehicles: {
              create: {
                model: d.car.model,
                color: d.car.color,
                plateNumber: d.car.plate,
                seats: d.car.seats,
                acceptsCargo: d.car.cargo,
                status: 'APPROVED',
              },
            },
            documents: {
              create: [
                { type: 'LICENSE', fileKey: `seed/drivers/${i}/license.webp`, status: 'APPROVED' },
                { type: 'TECH_PASSPORT', fileKey: `seed/drivers/${i}/tech-passport.webp`, status: 'APPROVED' },
              ],
            },
          },
        },
      },
      include: { driverProfile: { include: { vehicles: true } } },
    });
    drivers.push({ user, profile: user.driverProfile!, vehicle: user.driverProfile!.vehicles[0]!, home: d.home });
  }

  // Yo'lovchilar va yuk jo'natuvchilar
  const passengers = [];
  for (const [i, [firstName, lastName]] of PASSENGERS.entries()) {
    passengers.push(
      await prisma.user.create({
        data: { phone: `+9989322200${String(i).padStart(2, '0')}`, firstName, lastName, role: Role.PASSENGER },
      }),
    );
  }
  const senders = [];
  for (const [i, [firstName, lastName]] of SENDERS.entries()) {
    senders.push(
      await prisma.user.create({
        data: { phone: `+9989433300${String(i).padStart(2, '0')}`, firstName, lastName, role: Role.SENDER },
      }),
    );
  }

  // ── O'tgan (yakunlangan) safarlar — sharhlar va reyting uchun ──
  const completedBookings: { bookingId: string; passengerId: string; driverUserId: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const drv = drivers[i % drivers.length]!;
    const seats = Math.min(drv.vehicle.seats, 4);
    const r = route();
    const price = r.price;
    const trip = await prisma.trip.create({
      data: {
        driverId: drv.profile.id,
        vehicleId: drv.vehicle.id,
        fromCityId: r.fromCityId,
        toCityId: r.toCityId,
        departureAt: tashkent(-int(1, 10), pick([6, 8, 10, 14, 18])),
        totalSeats: seats,
        availableSeats: seats - 1,
        pricePerSeat: price,
        status: TripStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    const passenger = passengers[i % passengers.length]!;
    const booking = await prisma.booking.create({
      data: { tripId: trip.id, passengerId: passenger.id, seats: 1, seatNumbers: [2], totalPrice: price, status: BookingStatus.COMPLETED },
    });
    completedBookings.push({ bookingId: booking.id, passengerId: passenger.id, driverUserId: drv.user.id });
  }

  // ── Keyingi 7 kunga: 14 hudud orasidagi HAR BIR yo'nalishga (182 ta) 1–2 tadan safar ──
  const hours = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22];
  let bookingCount = 0;
  let upcomingCount = 0;
  const centerIds = CENTERS.map((c) => cityId(c.name));
  for (const [ai, from] of CENTERS.entries()) {
    for (const [bi, to] of CENTERS.entries()) {
      if (ai === bi) continue;
      const tripsHere = rand() < 0.5 ? 2 : 1;
      for (let k = 0; k < tripsHere; k++) {
        // Haydovchi — shu ikki hududdan birida yashaydigan
        const local = drivers.filter((d) => d.home === from.name || d.home === to.name);
        const drv = pick(local.length ? local : drivers);
        const day = k === 0 ? int(1, 3) : int(0, 6);
        let hour = pick(hours);
        if (day === 0) hour = Math.max(hour, 21); // bugun — faqat kechki safarlar
        const departureAt = tashkent(day, hour, pick([0, 0, 30]));
        const fromCityId = rand() < 0.8 ? centerIds[ai]! : nearby(centerIds[ai]!);
        const toCityId = rand() < 0.8 ? centerIds[bi]! : nearby(centerIds[bi]!);
        const pricePerSeat = routePrice(from, to);
        const totalSeats = drv.vehicle.seats;
        // Ko'p haydovchilar old o'rinni qimmatroq qo'yadi
        const frontExtra = rand() < 0.6 ? pick([10_000, 20_000, 30_000]) : 0;
        const seatPrices = Array.from({ length: totalSeats }, (_, j) => (j === 0 ? pricePerSeat + frontExtra : pricePerSeat));

        const trip = await prisma.trip.create({
          data: {
            driverId: drv.profile.id,
            vehicleId: drv.vehicle.id,
            fromCityId,
            toCityId,
            departureAt,
            totalSeats,
            availableSeats: totalSeats,
            pricePerSeat,
            seatPrices: frontExtra ? seatPrices : Prisma.DbNull,
            pickupFromHome: rand() < 0.6,
            acceptsCargo: drv.vehicle.acceptsCargo,
            note: pick(TRIP_NOTES),
          },
        });
        upcomingCount++;

        // Har safarga 0–2 ta band qilish: tasodifiy bo'sh o'rinlar, xaritadagi nuqtalar bilan
        let free = totalSeats;
        const n = int(0, 2);
        const used = new Set<string>();
        const takenSeats = new Set<number>();
        for (let bk = 0; bk < n && free > 0; bk++) {
          const passenger = pick(passengers);
          if (used.has(passenger.id)) continue;
          used.add(passenger.id);
          const seats = Math.min(int(1, 2), free);
          const freeSeats = Array.from({ length: totalSeats }, (_, j) => j + 1).filter((j) => !takenSeats.has(j));
          const seatNumbers = [...freeSeats].sort(() => rand() - 0.5).slice(0, seats).sort((x, y) => x - y);
          seatNumbers.forEach((j) => takenSeats.add(j));
          const pickup = jitter(from);
          const dropoff = jitter(to);
          await prisma.booking.create({
            data: {
              tripId: trip.id,
              passengerId: passenger.id,
              seats,
              seatNumbers,
              totalPrice: seatNumbers.reduce((sum, j) => sum + seatPrices[j - 1]!, 0),
              ...(trip.pickupFromHome ? { pickupAddress: `${from.name}, ${pick(STREETS)}`, pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
              ...(rand() < 0.7 ? { dropoffAddress: `${to.name}, ${pick(STREETS)}`, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng } : {}),
              status: rand() < 0.6 ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
            },
          });
          free -= seats;
          bookingCount++;
        }
        if (free !== totalSeats) {
          await prisma.trip.update({ where: { id: trip.id }, data: { availableSeats: free } });
        }
      }
    }
  }

  // ── Sharhlar (yakunlangan safarlardan) ──
  for (const cb of completedBookings) {
    await prisma.review.create({
      data: {
        authorId: cb.passengerId,
        targetUserId: cb.driverUserId,
        bookingId: cb.bookingId,
        targetRole: 'DRIVER',
        rating: pick([5, 5, 5, 4, 4, 3]),
        text: pick(REVIEW_TEXTS),
      },
    });
  }

  // Haydovchi reytingi va safarlar sonini hisoblash
  for (const drv of drivers) {
    const agg = await prisma.review.aggregate({
      where: { targetUserId: drv.user.id, targetRole: 'DRIVER' },
      _avg: { rating: true },
      _count: true,
    });
    const avg = agg._avg.rating ?? 0;
    const tripsCount = await prisma.trip.count({ where: { driverId: drv.profile.id, status: TripStatus.COMPLETED } });
    await prisma.driverProfile.update({
      where: { id: drv.profile.id },
      data: {
        ratingAvg: new Prisma.Decimal(avg.toFixed(2)),
        ratingCount: agg._count,
        // Bayes bahosi — src/modules/reviews/reviews.service.ts dagi ratingScore bilan bir xil
        ratingScore: new Prisma.Decimal(((avg * agg._count + 4.3 * 5) / (agg._count + 5)).toFixed(3)),
        tripsCount: tripsCount + int(20, 220), // platformadan oldingi tajriba o'rniga
      },
    });
  }

  // ── 30 ta yuk so'rovi (turli yo'nalishlar) + takliflar ──
  const cargoDrivers = drivers.filter((d) => d.vehicle.acceptsCargo);
  const cargoList = [...CARGO_SAMPLES, ...CARGO_SAMPLES, ...CARGO_SAMPLES];
  for (const [i, c] of cargoList.entries()) {
    const sender = senders[i % senders.length]!;
    const r = route();
    const pickup = jitter(r.from);
    const dropoff = jitter(r.to);
    const cargo = await prisma.cargoRequest.create({
      data: {
        senderId: sender.id,
        type: c.type,
        weightKg: c.weightKg,
        lengthCm: c.dims?.[0],
        widthCm: c.dims?.[1],
        heightCm: c.dims?.[2],
        fromCityId: r.fromCityId,
        toCityId: r.toCityId,
        pickupAddress: `${r.from.name}, ${pick(STREETS)}`,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffAddress: `${r.to.name}, ${pick(STREETS)}`,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        date: tashkent(int(0, 5), 9),
        offeredPrice: c.price,
        description: c.description,
        status: i % 10 < 7 ? CargoStatus.OPEN : CargoStatus.MATCHED,
      },
    });

    const offerCount = i % 10 < 7 ? int(0, 2) : 2;
    const offerDrivers = [...cargoDrivers].sort(() => rand() - 0.5).slice(0, offerCount);
    for (const [j, od] of offerDrivers.entries()) {
      const accepted = cargo.status === CargoStatus.MATCHED && j === 0;
      await prisma.cargoOffer.create({
        data: {
          cargoRequestId: cargo.id,
          driverId: od.profile.id,
          price: c.price + int(-5, 10) * 10_000,
          message: pick(["Ertaga ertalab olib ketaman.", 'Bugun kechqurun yo\'lga chiqaman.', null]),
          status:
            cargo.status === CargoStatus.MATCHED
              ? accepted
                ? OfferStatus.ACCEPTED
                : OfferStatus.REJECTED
              : OfferStatus.PENDING,
        },
      });
    }
  }

  const counts = {
    cities: await prisma.city.count(),
    users: await prisma.user.count(),
    drivers: drivers.length,
    tripsUpcoming: upcomingCount,
    tripsCompleted: completedBookings.length,
    bookings: bookingCount + completedBookings.length,
    cargo: await prisma.cargoRequest.count(),
    offers: await prisma.cargoOffer.count(),
    reviews: await prisma.review.count(),
  };
  console.log('Seed tayyor:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
