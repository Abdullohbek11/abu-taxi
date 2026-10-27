/**
 * Demo ma'lumotlarni QO'SHADI (mavjudlarini o'chirmaydi): ko'proq haydovchi, yo'lovchi, kelgusi 14 kunlik safarlar,
 * o'tgan safarlar va ikki tomonlama sharhlar, yuklar va safar so'rovlari. Qayta ishga tushirilsa, takrorlanmaydi
 * (demo foydalanuvchilar +99899… raqamlari bilan aniqlanadi).
 *
 *   npm run seed:demo                       # lokal
 *   NODE_ENV=development npm run seed:demo  # serverda (production'da himoya bor)
 */
import { BookingStatus, CargoType, Prisma, PrismaClient, ReviewRole, Role } from '@prisma/client';

const prisma = new PrismaClient();

let seedState = 20261027;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

/** Toshkent vaqti (UTC+5) bo'yicha sana → UTC Date */
function tashkent(daysFromToday: number, hour: number, minute = 0): Date {
  const local = new Date(Date.now() + 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysFromToday, hour - 5, minute));
}

type Center = { name: string; lat: number; lng: number; plate: string; weight: number };
/** weight — qatnov ko'pligi (Toshkent va vodiy yo'nalishlari eng gavjum) */
const CENTERS: Center[] = [
  { name: 'Toshkent', lat: 41.2995, lng: 69.2401, plate: '01', weight: 10 },
  { name: 'Nurafshon', lat: 41.0167, lng: 69.35, plate: '10', weight: 2 },
  { name: 'Guliston', lat: 40.4897, lng: 68.7842, plate: '20', weight: 2 },
  { name: 'Jizzax', lat: 40.1158, lng: 67.8422, plate: '25', weight: 3 },
  { name: 'Samarqand', lat: 39.6542, lng: 66.9597, plate: '30', weight: 6 },
  { name: "Farg'ona", lat: 40.3864, lng: 71.7864, plate: '40', weight: 5 },
  { name: 'Namangan', lat: 40.9983, lng: 71.6726, plate: '50', weight: 5 },
  { name: 'Andijon', lat: 40.7821, lng: 72.3442, plate: '60', weight: 5 },
  { name: 'Qarshi', lat: 38.8606, lng: 65.7891, plate: '70', weight: 3 },
  { name: 'Termiz', lat: 37.2242, lng: 67.2783, plate: '75', weight: 2 },
  { name: 'Buxoro', lat: 39.7681, lng: 64.4556, plate: '80', weight: 4 },
  { name: 'Navoiy', lat: 40.0844, lng: 65.3792, plate: '85', weight: 2 },
  { name: 'Urganch', lat: 41.55, lng: 60.6333, plate: '90', weight: 2 },
  { name: 'Nukus', lat: 42.46, lng: 59.61, plate: '95', weight: 2 },
];

function distanceKm(a: Center, b: Center): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const routePrice = (a: Center, b: Center) => Math.max(30_000, Math.round((distanceKm(a, b) * 1.25 * 380) / 10_000) * 10_000) + int(0, 2) * 10_000;
const jitter = (c: Center) => ({ lat: +(c.lat + (rand() - 0.5) * 0.05).toFixed(6), lng: +(c.lng + (rand() - 0.5) * 0.05).toFixed(6) });

const MALE = ['Abdulaziz', 'Akmal', 'Anvar', 'Asror', 'Aziz', 'Bahrom', 'Bobur', 'Dilshod', 'Doniyor', 'Eldor', 'Farrux', 'Ikrom', 'Islom', 'Jamshid', 'Javohir', 'Kamron', 'Mirjalol', 'Muhammadali', 'Nurbek', 'Otabek', 'Ravshan', 'Sanjar', 'Sardor', 'Sherzod', 'Sirojiddin', 'Temur', 'Ulugbek', 'Xasan', 'Zafar', 'Jasur'];
const FEMALE = ['Aziza', 'Dilnoza', 'Gulnora', 'Kamola', 'Madina', 'Malika', 'Mohira', 'Nigora', 'Nilufar', 'Sabina', 'Sevara', 'Shahnoza', 'Umida', 'Zarina', 'Feruza', 'Nodira'];
const LAST = ['Aliyev', 'Azimov', 'Bakirov', 'Ergashev', 'Hasanov', 'Ismoilov', 'Jurayev', 'Karimov', 'Mirzayev', 'Nazarov', 'Odilov', 'Qodirov', 'Rahimov', 'Saidov', 'Tursunov', 'Umarov', 'Valiyev', 'Xoliqov', 'Yusupov', "Zokirov"];
const fem = (last: string) => (last.endsWith('ov') || last.endsWith('ev') ? `${last}a` : last);

const CARS = [
  { model: 'Chevrolet Cobalt', seats: 4, cargo: false },
  { model: 'Chevrolet Gentra', seats: 4, cargo: false },
  { model: 'Chevrolet Nexia 3', seats: 4, cargo: true },
  { model: 'Chevrolet Lacetti', seats: 4, cargo: true },
  { model: 'Chevrolet Malibu 2', seats: 4, cargo: false },
  { model: 'Chevrolet Onix', seats: 4, cargo: false },
  { model: 'Chevrolet Tracker 2', seats: 4, cargo: true },
  { model: 'Chevrolet Damas', seats: 6, cargo: true },
  { model: 'Kia K5', seats: 4, cargo: false },
  { model: 'Kia Sonet', seats: 4, cargo: true },
  { model: 'BYD Song Plus', seats: 4, cargo: false },
  { model: 'Hyundai Staria', seats: 7, cargo: true },
  { model: 'Toyota Hiace', seats: 12, cargo: true },
];
const COLORS = ['Oq', 'Qora', 'Kumush', 'Kulrang', "Ko'k", 'Qizil', 'Bej', "To'q yashil"];
const LETTERS = [...'ABDEFHJKLMNOPQRSTUVXYZ'];
const NOTES = [
  'Konditsioner bor, mashina toza.',
  'Katta sumkalar uchun bagaj bo\'sh.',
  'Yo\'lda bitta to\'xtash — choy uchun.',
  'Chekilmaydi, musiqa past.',
  'Aeroportdan ham olib ketaman.',
  'Ayollar uchun old o\'rin bo\'sh.',
  'Vaqtida chiqaman, kechikmang iltimos.',
  'Yo\'lda Wi‑Fi bor.',
  null,
  null,
];
const DRIVER_REVIEWS = [
  'Juda madaniyatli haydovchi, rahmat!',
  'Vaqtida yetib keldik, mashina toza.',
  'Uydan olib ketdi, yuklarga yordam berdi.',
  'Xavfsiz haydadi, tavsiya qilaman.',
  'Narx kelishilganidek, ortiqcha so\'ramadi.',
  'Yo\'l yaxshi o\'tdi, yana shu haydovchi bilan boraman.',
  'Biroz kechikdi, lekin oldindan ogohlantirdi.',
  'Konditsioner ishlamadi, qolgani yaxshi.',
];
const CLIENT_REVIEWS = ['Vaqtida chiqdi, rahmat.', 'Juda yoqimli yo\'lovchi.', 'Manzil aniq aytildi.', 'Biroz kutdirdi.', null];
const CARGO = [
  { type: CargoType.FURNITURE, kg: [40, 150], text: ['Divan, qadoqlangan', 'Shkaf, qismlarga ajratilgan', 'Oshxona stoli va 4 ta stul', 'Karavot'] },
  { type: CargoType.APPLIANCE, kg: [15, 90], text: ['Muzlatgich', 'Kir yuvish mashinasi', 'Televizor 55"', 'Konditsioner'] },
  { type: CargoType.FOOD, kg: [10, 300], text: ['Qovun, 10 qop', 'Uzum yashiklarda', 'Guruch 5 qop', 'Kartoshka'] },
  { type: CargoType.CONSTRUCTION, kg: [50, 800], text: ['Sement 20 qop', 'Kafel', 'Plastik trubalar', 'Eshik romlari'] },
  { type: CargoType.OTHER, kg: [1, 30], text: ['Hujjatlar paketi', 'Sovg\'a qutisi', 'Dori-darmon', 'Kiyim-kechak sumkasi'] },
];
const STREETS = ["Mustaqillik ko'chasi", "Navoiy ko'chasi", "Amir Temur ko'chasi", 'markaziy bozor yonida', 'avtovokzal yonida', 'temir yo\'l vokzali oldida', 'universitet yonida'];

/** Og'irlik bo'yicha tasodifiy markaz */
function weighted(): Center {
  const total = CENTERS.reduce((s, c) => s + c.weight, 0);
  let x = rand() * total;
  for (const c of CENTERS) if ((x -= c.weight) <= 0) return c;
  return CENTERS[0]!;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error("Demo seed production muhitida ishga tushirilmaydi (NODE_ENV=development bilan)");
  if (await prisma.user.count({ where: { phone: { startsWith: '+99899' } } })) {
    console.log("Demo ma'lumotlar allaqachon qo'shilgan — o'tkazib yuborildi");
    return;
  }

  const cityByName = new Map<string, string>();
  for (const c of CENTERS) {
    const city = await prisma.city.findFirst({ where: { nameUz: c.name } });
    if (!city) throw new Error(`Shahar topilmadi: ${c.name} (avval asosiy seed/migratsiyalar)`);
    cityByName.set(c.name, city.id);
  }
  const cityId = (c: Center) => cityByName.get(c.name)!;
  let phoneSeq = 0;
  const phone = () => `+99899${String(1_000_000 + phoneSeq++).slice(-7)}`;

  // ── Haydovchilar: har markazda, Toshkentda ko'proq ──
  const drivers: { userId: string; profileId: string; vehicleId: string; seats: number; cargo: boolean; home: Center }[] = [];
  const usedPlates = new Set((await prisma.vehicle.findMany({ select: { plateNumber: true } })).map((v) => v.plateNumber));
  for (let i = 0; i < 60; i++) {
    const home = i < 14 ? CENTERS[i]! : weighted();
    const car = pick(CARS);
    let plate = '';
    do plate = `${home.plate} ${pick(LETTERS)} ${int(100, 999)} ${pick(LETTERS)}${pick(LETTERS)}`;
    while (usedPlates.has(plate));
    usedPlates.add(plate);
    const first = pick(MALE);
    const user = await prisma.user.create({
      data: {
        phone: phone(),
        firstName: first,
        lastName: pick(LAST),
        role: Role.DRIVER,
        telegramUsername: rand() < 0.5 ? `${first.toLowerCase().replace(/[^a-z]/g, '')}_${home.plate}${i}` : null,
        createdAt: tashkent(-int(5, 120), 10),
        driverProfile: { create: { status: 'APPROVED', tripsCount: int(5, 400) } },
      },
      include: { driverProfile: true },
    });
    const vehicle = await prisma.vehicle.create({
      data: { driverId: user.driverProfile!.id, model: car.model, color: pick(COLORS), plateNumber: plate, seats: car.seats, acceptsCargo: car.cargo, status: 'APPROVED' },
    });
    drivers.push({ userId: user.id, profileId: user.driverProfile!.id, vehicleId: vehicle.id, seats: car.seats, cargo: car.cargo, home });
  }

  // ── Yo'lovchilar va yuk egalari ──
  const passengers: string[] = [];
  for (let i = 0; i < 80; i++) {
    const woman = rand() < 0.45;
    const u = await prisma.user.create({
      data: { phone: phone(), firstName: woman ? pick(FEMALE) : pick(MALE), lastName: (() => { const l = pick(LAST); return woman ? fem(l) : l; })(), role: Role.PASSENGER, createdAt: tashkent(-int(1, 90), 12) },
    });
    passengers.push(u.id);
  }
  const senders: string[] = [];
  for (let i = 0; i < 20; i++) {
    const u = await prisma.user.create({ data: { phone: phone(), firstName: pick(MALE), lastName: pick(LAST), role: Role.SENDER, createdAt: tashkent(-int(1, 60), 15) } });
    senders.push(u.id);
  }

  const driverFor = (a: Center, b: Center) => {
    const local = drivers.filter((d) => d.home.name === a.name || d.home.name === b.name);
    return pick(local.length ? local : drivers);
  };
  const otherCenter = (a: Center) => {
    let b = weighted();
    while (b.name === a.name) b = weighted();
    return b;
  };

  // ── O'tgan safarlar (yakunlangan) + ikki tomonlama sharhlar ──
  let reviews = 0;
  for (let i = 0; i < 160; i++) {
    const from = weighted();
    const to = otherCenter(from);
    const d = driverFor(from, to);
    const day = -int(1, 13);
    const departureAt = tashkent(day, pick([6, 8, 10, 14, 18]));
    const price = routePrice(from, to);
    const trip = await prisma.trip.create({
      data: { driverId: d.profileId, vehicleId: d.vehicleId, fromCityId: cityId(from), toCityId: cityId(to), departureAt, totalSeats: d.seats, availableSeats: d.seats - 1, pricePerSeat: price, status: 'COMPLETED', completedAt: new Date(departureAt.getTime() + 6 * 3600_000), acceptsCargo: d.cargo },
    });
    const passengerId = pick(passengers);
    const booking = await prisma.booking.create({ data: { tripId: trip.id, passengerId, seats: 1, seatNumbers: [int(1, d.seats)], totalPrice: price, status: BookingStatus.COMPLETED } });
    if (rand() < 0.8) {
      await prisma.review.create({ data: { authorId: passengerId, targetUserId: d.userId, bookingId: booking.id, targetRole: ReviewRole.DRIVER, rating: pick([5, 5, 5, 5, 4, 4, 3]), text: rand() < 0.75 ? pick(DRIVER_REVIEWS) : null, createdAt: new Date(departureAt.getTime() + 8 * 3600_000) } });
      reviews++;
    }
    if (rand() < 0.5) {
      await prisma.review.create({ data: { authorId: d.userId, targetUserId: passengerId, bookingId: booking.id, targetRole: ReviewRole.CLIENT, rating: pick([5, 5, 5, 4, 4, 3]), text: pick(CLIENT_REVIEWS), createdAt: new Date(departureAt.getTime() + 9 * 3600_000) } });
      reviews++;
    }
  }

  // ── Kelgusi 14 kunlik safarlar: har kuni gavjum yo'nalishlarda ──
  let upcoming = 0;
  let bookings = 0;
  const hours = [5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 21];
  for (let day = 0; day <= 13; day++) {
    const perDay = day < 3 ? 70 : 45;
    for (let k = 0; k < perDay; k++) {
      const from = weighted();
      const to = otherCenter(from);
      const d = driverFor(from, to);
      let hour = pick(hours);
      if (day === 0) hour = Math.max(hour, 20);
      const price = routePrice(from, to);
      const frontExtra = rand() < 0.5 ? pick([10_000, 20_000]) : 0;
      const seatPrices = Array.from({ length: d.seats }, (_, j) => (j === 0 ? price + frontExtra : price));
      const trip = await prisma.trip.create({
        data: {
          driverId: d.profileId,
          vehicleId: d.vehicleId,
          fromCityId: cityId(from),
          toCityId: cityId(to),
          departureAt: tashkent(day, hour, pick([0, 0, 30])),
          totalSeats: d.seats,
          availableSeats: d.seats,
          pricePerSeat: price,
          seatPrices: frontExtra ? seatPrices : Prisma.DbNull,
          pickupFromHome: rand() < 0.6,
          acceptsCargo: d.cargo,
          note: pick(NOTES),
        },
      });
      upcoming++;
      let free = d.seats;
      const taken = new Set<number>();
      for (let b = 0, n = int(0, Math.min(3, d.seats - 1)); b < n; b++) {
        const seat = Array.from({ length: d.seats }, (_, j) => j + 1).filter((j) => !taken.has(j)).sort(() => rand() - 0.5)[0]!;
        taken.add(seat);
        const p = jitter(from);
        await prisma.booking.create({
          data: {
            tripId: trip.id,
            passengerId: pick(passengers),
            seats: 1,
            seatNumbers: [seat],
            totalPrice: seatPrices[seat - 1]!,
            pickupAddress: `${from.name}, ${pick(STREETS)}`,
            pickupLat: p.lat,
            pickupLng: p.lng,
            status: rand() < 0.65 ? BookingStatus.CONFIRMED : BookingStatus.PENDING,
          },
        });
        free--;
        bookings++;
      }
      if (free !== d.seats) await prisma.trip.update({ where: { id: trip.id }, data: { availableSeats: free } });
    }
  }

  // ── Yuklar (ochiq, takliflar bilan) ──
  let cargoCount = 0;
  for (let i = 0; i < 40; i++) {
    const from = weighted();
    const to = otherCenter(from);
    const s = pick(CARGO);
    const pickup = jitter(from);
    const dropoff = jitter(to);
    const cargo = await prisma.cargoRequest.create({
      data: {
        senderId: pick(senders),
        type: s.type,
        weightKg: int(s.kg[0]!, s.kg[1]!),
        fromCityId: cityId(from),
        toCityId: cityId(to),
        pickupAddress: `${from.name}, ${pick(STREETS)}`,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffAddress: `${to.name}, ${pick(STREETS)}`,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        date: tashkent(int(0, 10), 0),
        offeredPrice: rand() < 0.7 ? Math.round((routePrice(from, to) * int(2, 6)) / 10_000) * 10_000 : null,
        description: pick(s.text),
        photos: [],
      },
    });
    cargoCount++;
    const offerers = drivers.filter((d) => d.cargo).sort(() => rand() - 0.5).slice(0, int(0, 3));
    for (const d of offerers) {
      await prisma.cargoOffer.create({ data: { cargoRequestId: cargo.id, driverId: d.profileId, price: Math.round((routePrice(from, to) * int(2, 5)) / 10_000) * 10_000, message: pick(['Bugun olib ketaman', 'Ertaga ertalab chiqaman', 'Mashinam bo\'sh, ehtiyotkorlik bilan', null]) } });
    }
  }

  // ── Safar so'rovlari: ochiq (haydovchi kutmoqda) va topilgan ──
  let requests = 0;
  for (let i = 0; i < 35; i++) {
    const from = weighted();
    const to = otherCenter(from);
    const assigned = i >= 25;
    const d = assigned ? driverFor(from, to) : null;
    const driverUser = d ? await prisma.user.findUniqueOrThrow({ where: { id: d.userId }, include: { driverProfile: { include: { vehicles: true } } } }) : null;
    const v = driverUser?.driverProfile?.vehicles[0];
    await prisma.rideRequest.create({
      data: {
        passengerId: pick(passengers),
        fromCityId: cityId(from),
        toCityId: cityId(to),
        date: tashkent(int(0, 6), 0),
        seats: int(1, 3),
        offeredPrice: rand() < 0.6 ? routePrice(from, to) : null,
        note: pick(['Ertalab chiqsak yaxshi', 'Bolalar bilan', 'Katta yuk bor', 'Kechqurun', null]),
        status: assigned ? 'ASSIGNED' : 'OPEN',
        notifiedDrivers: int(0, 6),
        ...(assigned && driverUser && v
          ? {
              driverId: d!.profileId,
              vehicleId: v.id,
              pricePerSeat: routePrice(from, to),
              driverName: `${driverUser.firstName} ${driverUser.lastName}`,
              driverPhone: driverUser.phone,
              driverTelegram: driverUser.telegramUsername,
              carModel: v.model,
              carColor: v.color,
              carPlate: v.plateNumber,
              assignedAt: new Date(),
            }
          : {}),
      },
    });
    requests++;
  }

  // ── Reytinglarni qayta hisoblash (haydovchi + mijoz, Bayes bahosi bilan) ──
  await prisma.$executeRaw`
    UPDATE DriverProfile d
      LEFT JOIN (SELECT targetUserId, AVG(rating) a, COUNT(*) n FROM Review WHERE targetRole = 'DRIVER' GROUP BY targetUserId) x ON x.targetUserId = d.userId
      SET d.ratingAvg = ROUND(COALESCE(x.a, 0), 2), d.ratingCount = COALESCE(x.n, 0),
          d.ratingScore = ROUND((COALESCE(x.a, 0) * COALESCE(x.n, 0) + 4.3 * 5) / (COALESCE(x.n, 0) + 5), 3)`;
  await prisma.$executeRaw`
    UPDATE User u JOIN (SELECT targetUserId, AVG(rating) a, COUNT(*) n FROM Review WHERE targetRole = 'CLIENT' GROUP BY targetUserId) x ON x.targetUserId = u.id
      SET u.clientRatingAvg = ROUND(x.a, 2), u.clientRatingCount = x.n`;

  console.log({ drivers: drivers.length, passengers: passengers.length, senders: senders.length, pastTripsWithReviews: 160, reviews, upcomingTrips: upcoming, bookings, cargo: cargoCount, rideRequests: requests });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
