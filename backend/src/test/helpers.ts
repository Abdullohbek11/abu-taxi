import type { Role, User } from '@prisma/client';
import request from 'supertest';
import { signAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { storage } from '../lib/storage.js';
import sharp from 'sharp';
import { vi } from 'vitest';

let seq = 0;

export function uniquePhone(): string {
  seq += 1;
  return `+99890${String(Date.now() % 10_000).padStart(4, '0')}${String(seq % 1000).padStart(3, '0')}`;
}

export async function createUser(data: Partial<Omit<User, 'id'>> & { role?: Role | null } = {}) {
  const user = await prisma.user.create({
    data: { phone: uniquePhone(), firstName: 'Test', lastName: 'User', role: 'PASSENGER', ...data },
  });
  return { user, token: signAccessToken({ sub: user.id, role: user.role }) };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });


/** Test uchun haqiqiy PNG rasm. */
export function makePng(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 195, b: 0 } } }).png().toBuffer();
}

/** S3 o'rniga xotiradagi saqlash; yozilgan fayllar qaytariladi. */
export function mockStorage() {
  const files = new Map<string, Buffer>();
  vi.spyOn(storage, 'putPublic').mockImplementation(async (key, body) => {
    files.set(`public/${key}`, body);
    return `http://cdn.test/${key}`;
  });
  vi.spyOn(storage, 'putPrivate').mockImplementation(async (key, body) => {
    files.set(`private/${key}`, body);
    return key;
  });
  vi.spyOn(storage, 'signedUrl').mockImplementation(async (key) => `http://s3.test/private/${key}?signed=1`);
  vi.spyOn(storage, 'deletePrivate').mockImplementation(async (key) => void files.delete(`private/${key}`));
  vi.spyOn(storage, 'deletePublicUrl').mockImplementation(async () => {});
  return files;
}

/** Tasdiqlangan haydovchi + mashina. */
export async function createApprovedDriver(opts: { seats?: number; acceptsCargo?: boolean; firstName?: string } = {}) {
  const { user, token } = await createUser({ role: 'DRIVER', firstName: opts.firstName ?? 'Bahodir', lastName: 'Aliyev' });
  const profile = await prisma.driverProfile.create({ data: { userId: user.id, status: 'APPROVED' } });
  const vehicle = await prisma.vehicle.create({
    data: {
      driverId: profile.id,
      model: 'Chevrolet Cobalt',
      color: 'Oq',
      plateNumber: `01 A ${String(Math.floor(Math.random() * 900) + 100)} ${String.fromCharCode(65 + (seq % 26))}${String.fromCharCode(65 + ((seq * 7) % 26))}`,
      seats: opts.seats ?? 4,
      acceptsCargo: opts.acceptsCargo ?? false,
      status: 'APPROVED',
    },
  });
  seq += 1;
  return { user, token, profile, vehicle };
}

/**
 * Ketma-ket yaratiladi: resetDb o'chirgan (region, nameUz) unique kalitlariga parallel INSERT
 * InnoDB'da deadlock beradi (delete-marked yozuvlar ustidagi S/X qulflar to'qnashuvi).
 */
export async function createCities() {
  const andijon = await prisma.city.create({ data: { nameUz: 'Andijon', nameRu: 'Андижан', region: 'Andijon viloyati' } });
  const asaka = await prisma.city.create({ data: { nameUz: 'Asaka', nameRu: 'Асака', region: 'Andijon viloyati' } });
  const toshkent = await prisma.city.create({ data: { nameUz: 'Toshkent', nameRu: 'Ташкент', region: 'Toshkent shahri' } });
  return { andijon, asaka, toshkent };
}

/** n ta foydalanuvchini ketma-ket yaratadi (test tayyorgarligi parallel bo'lmasligi kerak — sinaladigan narsa API so'rovlari). */
export async function createUsers(n: number, data: Parameters<typeof createUser>[0] = {}) {
  const users = [];
  for (let i = 0; i < n; i++) users.push(await createUser(data));
  return users;
}

export async function createTrip(
  driver: { profile: { id: string }; vehicle: { id: string; seats: number } },
  data: { fromCityId: string; toCityId: string; seatPrices?: number[] } & Partial<Omit<import('@prisma/client').Trip, 'id' | 'seatPrices'>>,
) {
  const seats = data.totalSeats ?? driver.vehicle.seats;
  return prisma.trip.create({
    data: {
      driverId: driver.profile.id,
      vehicleId: driver.vehicle.id,
      departureAt: new Date(Date.now() + 24 * 3600_000),
      pricePerSeat: 150_000,
      totalSeats: seats,
      availableSeats: seats,
      ...data,
    },
  });
}

/** Bot ichki API sarlavhasi (test muhitidagi BOT_API_SECRET). */
export const botHeaders = () => ({ 'X-Bot-Secret': process.env.BOT_API_SECRET! });

type App = Parameters<typeof request>[0];

/** Botning o'zi qiladigan so'rov: Telegram foydalanuvchisiga kod olish. */
export function botLoginCode(
  app: App,
  body: { telegramId: string; phone?: string; firstName?: string; lastName?: string; username?: string; languageCode?: string },
) {
  return request(app).post('/api/v1/internal/bot/login-code').set(botHeaders()).send(body);
}

/** To'liq kirish: bot orqali kod → POST /auth/code. Qaytaradi: javob, access token va refresh cookie. */
export async function loginViaBot(app: App, telegramId: string, phone: string, extra: { headers?: Record<string, string> } = {}) {
  const code = await botLoginCode(app, { telegramId, phone, firstName: 'Ali', lastName: 'Valiyev', username: `u${telegramId}` });
  if (code.status !== 200) throw new Error(`bot login-code: ${code.status} ${JSON.stringify(code.body)}`);
  const res = await request(app).post('/api/v1/auth/code').set(extra.headers ?? {}).send({ code: code.body.data.code });
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = cookies.find((c) => c.startsWith('refresh_token='))?.split(';')[0];
  return { res, accessToken: res.body.data?.accessToken as string, cookie: cookie!, code: code.body.data.code as string };
}
