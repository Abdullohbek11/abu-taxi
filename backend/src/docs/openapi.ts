import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, type ZodTypeAny } from 'zod';
import { env } from '../config/env.js';
import { ERRORS } from '../lib/errors.js';
import { adminListQuery, blockBody, listAuditQuery, listDriversQuery, listUsersQuery, rejectBody } from '../modules/admin/admin.schema.js';
import { adminPaymentsQuery, billingSettingsBody, grantSubscriptionBody, onlinePaymentBody, rejectPaymentBody } from '../modules/billing/billing.schema.js';
import { adminLoginBody, changePasswordBody, loginCodeBody, refreshBody } from '../modules/auth/auth.schema.js';
import { ackNotificationsBody, loginCodeRequestBody, pendingNotificationsQuery } from '../modules/bot-api/botApi.schema.js';
import { createBookingBody, myBookingsQuery } from '../modules/bookings/bookings.schema.js';
import { cargoStatusBody, createCargoBody, createOfferBody, myCargoQuery, myOffersQuery, openCargoQuery } from '../modules/cargo/cargo.schema.js';
import { registerDriverBody } from '../modules/drivers/drivers.schema.js';
import { listNotificationsQuery } from '../modules/notifications/notifications.schema.js';
import {
  adminRideRequestsQuery,
  assignRideRequestBody,
  botGroupPostedBody,
  botTakeBody,
  botTelegramBody,
  createRideRequestBody,
  myRideRequestsQuery,
  openRideRequestsQuery,
  takeRideRequestBody,
} from '../modules/ride-requests/rideRequests.schema.js';
import { createReviewBody, userReviewsQuery } from '../modules/reviews/reviews.schema.js';
import { createTripBody, myTripsQuery, searchTripsQuery, updateTripBody } from '../modules/trips/trips.schema.js';
import { setRoleBody, updateMeBody } from '../modules/users/users.schema.js';
import { createVehicleBody, updateVehicleBody } from '../modules/vehicles/vehicles.schema.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Access token (15 daqiqa). POST /auth/code yoki /auth/refresh javobidan olinadi.',
});

registry.registerComponent('securitySchemes', 'botSecret', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Bot-Secret',
  description: 'Faqat Telegram bot uchun (bot/ papkasi). Production\'da tashqaridan yopiq.',
});

const ErrorResponse = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.enum(Object.keys(ERRORS) as [string, ...string[]]),
      message: z.string().openapi({ description: 'Accept-Language (uz | ru) bo\'yicha' }),
      fields: z.record(z.string()).optional().openapi({ description: 'Validatsiya xatolari: maydon → xabar' }),
    }),
  }),
);

const SuccessResponse = z.object({
  success: z.literal(true),
  data: z.any(),
  meta: z.object({ nextCursor: z.string().nullable().optional() }).passthrough().optional(),
});

const idParam = z.object({ id: z.string().openapi({ example: 'cmuoe45dd000008td0srq9r1v' }) });

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface Route {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  /** false — ochiq; 'bot' — X-Bot-Secret; standart — Bearer */
  auth?: boolean | 'bot';
  params?: z.AnyZodObject;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  /** multipart/form-data maydonlari */
  multipart?: Record<string, 'file' | 'files' | 'string'>;
  status?: 200 | 201;
}

/** Zod effektlarini (refine/transform) ochib, OpenAPI uchun oddiy obyektga keltiradi. */
function unwrapObject(schema: ZodTypeAny): z.AnyZodObject {
  let s: ZodTypeAny = schema;
  while (s instanceof z.ZodEffects) s = s.innerType();
  return s as z.AnyZodObject;
}

function register(r: Route) {
  const request: Record<string, unknown> = {};
  if (r.params) request.params = r.params;
  if (r.query) request.query = unwrapObject(r.query);
  if (r.body) request.body = { content: { 'application/json': { schema: r.body } } };
  if (r.multipart) {
    const shape: Record<string, ZodTypeAny> = {};
    for (const [k, t] of Object.entries(r.multipart)) {
      shape[k] =
        t === 'file'
          ? z.string().openapi({ type: 'string', format: 'binary' })
          : t === 'files'
            ? z.array(z.string().openapi({ type: 'string', format: 'binary' }))
            : z.string();
    }
    request.body = { content: { 'multipart/form-data': { schema: z.object(shape) } } };
  }

  registry.registerPath({
    method: r.method,
    path: r.path,
    tags: [r.tag],
    summary: r.summary,
    security: r.auth === false ? [] : r.auth === 'bot' ? [{ botSecret: [] }] : [{ bearerAuth: [] }],
    request,
    responses: {
      [r.status ?? 200]: { description: 'Muvaffaqiyatli', content: { 'application/json': { schema: SuccessResponse } } },
      400: { description: 'Validatsiya xatosi', content: { 'application/json': { schema: ErrorResponse } } },
      401: { description: 'Avtorizatsiya kerak', content: { 'application/json': { schema: ErrorResponse } } },
      403: { description: "Ruxsat yo'q", content: { 'application/json': { schema: ErrorResponse } } },
      404: { description: 'Topilmadi', content: { 'application/json': { schema: ErrorResponse } } },
      409: { description: "Holat ziddiyati / noto'g'ri o'tish", content: { 'application/json': { schema: ErrorResponse } } },
    },
  });
}

const tripIdOnly = idParam;
const photoIndex = idParam.extend({ index: z.coerce.number().int() });

const routes: Route[] = [
  // Auth
  { method: 'post', path: '/auth/code', tag: 'Auth', summary: "Botdan olingan kod bilan kirish/ro'yxatdan o'tish → accessToken + refresh cookie. Mobil: `X-Client: mobile` (Origin'siz) bo'lsa refreshToken body'da ham", auth: false, body: loginCodeBody },
  { method: 'post', path: '/auth/admin/login', tag: 'Auth', summary: 'Admin panelga parol bilan kirish (faqat ADMIN). Xato: ADMIN_LOGIN_INVALID, ADMIN_LOGIN_LOCKED', auth: false, body: adminLoginBody },
  { method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Refresh token rotatsiyasi (cookie yoki body)', auth: false, body: refreshBody },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Joriy sessiyani yopish', auth: false, body: refreshBody },
  { method: 'post', path: '/auth/logout-all', tag: 'Auth', summary: 'Barcha sessiyalarni yopish' },

  // Users
  { method: 'get', path: '/users/me', tag: 'Users', summary: "O'z profilim" },
  { method: 'patch', path: '/users/me', tag: 'Users', summary: 'Profilni tahrirlash', body: updateMeBody },
  { method: 'post', path: '/users/me/avatar', tag: 'Users', summary: 'Avatar yuklash (jpg/png/webp ≤5MB → webp)', multipart: { file: 'file' } },
  { method: 'patch', path: '/users/me/role', tag: 'Users', summary: 'Rol tanlash (yangi accessToken qaytadi)', body: setRoleBody },
  { method: 'get', path: '/users/{id}/public', tag: 'Users', summary: "Ommaviy profil (telefon yo'q)", auth: false, params: idParam },
  { method: 'get', path: '/users/{id}/reviews', tag: 'Reviews', summary: 'Foydalanuvchi haqidagi sharhlar', auth: false, params: idParam, query: userReviewsQuery },

  // Cities
  { method: 'get', path: '/cities', tag: 'Cities', summary: "Shaharlar va tumanlar ro'yxati", auth: false },

  // Drivers
  { method: 'post', path: '/drivers/register', tag: 'Drivers', summary: "Haydovchi sifatida ro'yxatdan o'tish (PENDING)", body: registerDriverBody, status: 201 },
  { method: 'get', path: '/drivers/me', tag: 'Drivers', summary: 'Haydovchi profili, mashinalar, hujjatlar (10 daqiqalik havolalar)' },
  { method: 'get', path: '/drivers/me/stats', tag: 'Drivers', summary: 'Bugungi safarlar, 7 kunlik daromad, safarlar soni' },
  { method: 'post', path: '/drivers/me/documents', tag: 'Drivers', summary: 'Hujjat yuklash (PRIVATE bucket)', multipart: { type: 'string', file: 'file' }, status: 201 },

  // Vehicles
  { method: 'get', path: '/vehicles', tag: 'Vehicles', summary: 'Mening mashinalarim' },
  { method: 'post', path: '/vehicles', tag: 'Vehicles', summary: "Mashina qo'shish", body: createVehicleBody, status: 201 },
  { method: 'get', path: '/vehicles/{id}', tag: 'Vehicles', summary: 'Mashina', params: idParam },
  { method: 'patch', path: '/vehicles/{id}', tag: 'Vehicles', summary: "Tahrirlash (raqam/model o'zgarsa qayta tekshiruv)", params: idParam, body: updateVehicleBody },
  { method: 'delete', path: '/vehicles/{id}', tag: 'Vehicles', summary: "O'chirish (safarlari bo'lmasa)", params: idParam },
  { method: 'post', path: '/vehicles/{id}/photos', tag: 'Vehicles', summary: 'Rasmlar yuklash (jami ≤6)', params: idParam, multipart: { photos: 'files' } },
  { method: 'delete', path: '/vehicles/{id}/photos/{index}', tag: 'Vehicles', summary: "Rasmni o'chirish", params: photoIndex },

  // Trips
  { method: 'get', path: '/trips', tag: 'Trips', summary: 'Safar qidiruvi (cursor pagination)', auth: false, query: searchTripsQuery },
  { method: 'get', path: '/trips/my', tag: 'Trips', summary: 'Haydovchining safarlari', query: myTripsQuery },
  { method: 'get', path: '/trips/{id}', tag: 'Trips', summary: 'Safar tafsiloti (+ myBooking, token bilan)', auth: false, params: tripIdOnly },
  { method: 'post', path: '/trips', tag: 'Trips', summary: "Safar e'lon qilish (APPROVED haydovchi)", body: createTripBody, status: 201 },
  { method: 'patch', path: '/trips/{id}', tag: 'Trips', summary: 'Safarni tahrirlash', params: tripIdOnly, body: updateTripBody },
  { method: 'post', path: '/trips/{id}/cancel', tag: 'Trips', summary: 'Bekor qilish', params: tripIdOnly },
  { method: 'post', path: '/trips/{id}/start', tag: 'Trips', summary: "Boshlash (jo'nashdan ≤2 soat oldin)", params: tripIdOnly },
  { method: 'post', path: '/trips/{id}/complete', tag: 'Trips', summary: 'Yakunlash', params: tripIdOnly },
  { method: 'get', path: '/trips/{id}/bookings', tag: 'Bookings', summary: 'Safardagi band qilishlar (haydovchi)', params: tripIdOnly },

  // Bookings
  { method: 'post', path: '/bookings', tag: 'Bookings', summary: 'Band qilish (atomik)', body: createBookingBody, status: 201 },
  { method: 'get', path: '/bookings/my', tag: 'Bookings', summary: 'Mening band qilishlarim', query: myBookingsQuery },
  { method: 'get', path: '/bookings/{id}', tag: 'Bookings', summary: "Band qilish (yo'lovchi yoki safar haydovchisi)", params: idParam },
  { method: 'post', path: '/bookings/{id}/confirm', tag: 'Bookings', summary: 'Tasdiqlash (haydovchi) — kontaktlar ochiladi', params: idParam },
  { method: 'post', path: '/bookings/{id}/reject', tag: 'Bookings', summary: 'Rad etish (haydovchi)', params: idParam },
  { method: 'post', path: '/bookings/{id}/cancel', tag: 'Bookings', summary: "Bekor qilish (yo'lovchi)", params: idParam },

  // Cargo
  { method: 'post', path: '/cargo', tag: 'Cargo', summary: "Yuk so'rovi (JSON yoki multipart + photos ≤5)", body: createCargoBody, status: 201 },
  { method: 'get', path: '/cargo/my', tag: 'Cargo', summary: "Mening yuk so'rovlarim", query: myCargoQuery },
  { method: 'get', path: '/cargo/open', tag: 'Cargo', summary: "Ochiq so'rovlar (haydovchilar)", query: openCargoQuery },
  { method: 'get', path: '/cargo/{id}', tag: 'Cargo', summary: "Yuk so'rovi", params: idParam },
  { method: 'post', path: '/cargo/{id}/cancel', tag: 'Cargo', summary: 'Bekor qilish (egasi)', params: idParam },
  { method: 'post', path: '/cargo/{id}/status', tag: 'Cargo', summary: 'IN_TRANSIT / DELIVERED', params: idParam, body: cargoStatusBody },
  { method: 'post', path: '/cargo/{id}/offers', tag: 'Cargo', summary: 'Taklif berish (APPROVED haydovchi)', params: idParam, body: createOfferBody, status: 201 },
  { method: 'get', path: '/cargo/{id}/offers', tag: 'Cargo', summary: 'Takliflar (egasi)', params: idParam },
  { method: 'get', path: '/offers/my', tag: 'Cargo', summary: 'Haydovchining takliflari', query: myOffersQuery },
  { method: 'post', path: '/offers/{id}/accept', tag: 'Cargo', summary: 'Qabul qilish — qolganlari REJECTED', params: idParam },
  { method: 'post', path: '/offers/{id}/reject', tag: 'Cargo', summary: 'Rad etish', params: idParam },
  { method: 'post', path: '/offers/{id}/withdraw', tag: 'Cargo', summary: 'Qaytarib olish (haydovchi)', params: idParam },

  // Safar so'rovlari
  { method: 'post', path: '/ride-requests', tag: 'Ride requests', summary: "Safar topilmasa so'rov qoldirish: mos haydovchilarga bot orqali, keyin Telegram guruhga", body: createRideRequestBody, status: 201 },
  { method: 'get', path: '/ride-requests/my', tag: 'Ride requests', summary: "Mening so'rovlarim (ASSIGNED bo'lsa — haydovchi, mashina, narx, telefon)", query: myRideRequestsQuery },
  { method: 'get', path: '/ride-requests/open', tag: 'Ride requests', summary: "Ochiq so'rovlar (APPROVED haydovchi, telefon yo'q)", query: openRideRequestsQuery },
  { method: 'get', path: '/ride-requests/assigned', tag: 'Ride requests', summary: "Haydovchiga biriktirilgan so'rovlar (yo'lovchi kontakti bilan)" },
  { method: 'post', path: '/ride-requests/{id}/take', tag: 'Ride requests', summary: "Olaman: narx kishi boshiga. Ikki haydovchidan faqat bittasi o'tadi (409 RIDE_REQUEST_NOT_OPEN)", params: idParam, body: takeRideRequestBody },
  { method: 'post', path: '/ride-requests/{id}/cancel', tag: 'Ride requests', summary: 'Bekor qilish (yo\'lovchi)', params: idParam },

  // Reviews
  { method: 'post', path: '/reviews', tag: 'Reviews', summary: 'Sharh (COMPLETED/DELIVERED dan keyin 14 kun ichida)', body: createReviewBody, status: 201 },

  // Landing (ommaviy)
  { method: 'get', path: '/stats/public', tag: 'Landing', summary: "Haqiqiy ko'rsatkichlar: yakunlangan safarlar, tasdiqlangan haydovchilar, o'rtacha reyting", auth: false },
  { method: 'get', path: '/reviews/recent', tag: 'Landing', summary: 'Oxirgi haqiqiy sharhlar (4–5 baho, matnli)', auth: false },

  // Notifications
  { method: 'get', path: '/notifications', tag: 'Notifications', summary: "Bildirishnomalar (meta.unreadCount)", query: listNotificationsQuery },
  { method: 'post', path: '/notifications/{id}/read', tag: 'Notifications', summary: "O'qildi", params: idParam },
  { method: 'post', path: '/notifications/read-all', tag: 'Notifications', summary: "Hammasi o'qildi" },

  // Admin
  { method: 'get', path: '/admin/stats', tag: 'Admin', summary: 'Umumiy statistika' },
  { method: 'get', path: '/admin/users', tag: 'Admin', summary: 'Foydalanuvchilarni qidirish (telefon, ism, username)', query: listUsersQuery },
  { method: 'get', path: '/admin/audit', tag: 'Admin', summary: 'Admin amallari jurnali', query: listAuditQuery },
  { method: 'get', path: '/admin/drivers', tag: 'Admin', summary: "Haydovchilar ro'yxati", query: listDriversQuery },
  { method: 'post', path: '/admin/drivers/{id}/approve', tag: 'Admin', summary: 'Tasdiqlash (hujjat va mashinalar bilan)', params: idParam },
  { method: 'post', path: '/admin/drivers/{id}/reject', tag: 'Admin', summary: 'Rad etish', params: idParam, body: rejectBody },
  { method: 'post', path: '/admin/vehicles/{id}/approve', tag: 'Admin', summary: 'Mashinani tasdiqlash', params: idParam },
  { method: 'post', path: '/admin/vehicles/{id}/reject', tag: 'Admin', summary: 'Mashinani rad etish', params: idParam },
  { method: 'get', path: '/admin/documents/{id}', tag: 'Admin', summary: 'Hujjat uchun 10 daqiqalik signed URL', params: idParam },
  { method: 'post', path: '/admin/users/{id}/block', tag: 'Admin', summary: 'Bloklash (sessiyalar bekor, sabab ixtiyoriy)', params: idParam, body: blockBody },
  { method: 'post', path: '/admin/users/{id}/unblock', tag: 'Admin', summary: 'Blokdan chiqarish', params: idParam },
  { method: 'get', path: '/billing/plan', tag: 'Billing', summary: "Haydovchi tarifi: narx, karta, obuna holati, to'lovlar" },
  { method: 'post', path: '/billing/payments', tag: 'Billing', summary: "Kartaga to'lov: multipart file (chek rasmi, ixtiyoriy) + note. Admin tasdiqlaydi", multipart: { file: 'file', note: 'string' }, status: 201 },
  { method: 'post', path: '/billing/payments/online', tag: 'Billing', summary: "Payme / Click to'lov sahifasi havolasi", body: onlinePaymentBody, status: 201 },
  { method: 'get', path: '/admin/billing/settings', tag: 'Admin', summary: 'Tarif sozlamalari' },
  { method: 'put', path: '/admin/billing/settings', tag: 'Admin', summary: 'Tarif: yoqish, narx, kun, sinov kunlari, karta, Telegram, Payme/Click', body: billingSettingsBody },
  { method: 'get', path: '/admin/payments', tag: 'Admin', summary: "To'lovlar", query: adminPaymentsQuery },
  { method: 'get', path: '/admin/payments/{id}/receipt', tag: 'Admin', summary: 'Chek rasmi (10 daqiqalik signed URL)', params: idParam },
  { method: 'post', path: '/admin/payments/{id}/confirm', tag: 'Admin', summary: 'Tasdiqlash — obuna uzayadi', params: idParam },
  { method: 'post', path: '/admin/payments/{id}/reject', tag: 'Admin', summary: 'Rad etish (sabab bilan)', params: idParam, body: rejectPaymentBody },
  { method: 'post', path: '/admin/users/{id}/subscription', tag: 'Admin', summary: "Qo'lda obuna berish", params: idParam, body: grantSubscriptionBody },
  { method: 'get', path: '/admin/overview', tag: 'Admin', summary: 'Umumiy statistika + 30 kunlik dinamika, top yo\'nalishlar va haydovchilar' },
  { method: 'get', path: '/admin/users/{id}', tag: 'Admin', summary: "Mijozning to'liq kartasi (ko'rish jurnalga yoziladi)", params: idParam },
  { method: 'get', path: '/admin/trips', tag: 'Admin', summary: 'Safarlar (holat, qidiruv)', query: adminListQuery },
  { method: 'get', path: '/admin/bookings', tag: 'Admin', summary: 'Band qilishlar', query: adminListQuery },
  { method: 'get', path: '/admin/cargo', tag: 'Admin', summary: 'Yuklar', query: adminListQuery },
  { method: 'get', path: '/admin/reviews', tag: 'Admin', summary: 'Sharhlar (status=LOW — 1–2 baho)', query: adminListQuery },
  { method: 'delete', path: '/admin/reviews/{id}', tag: 'Admin', summary: "Sharhni o'chirish (reyting qayta hisoblanadi)", params: idParam },
  { method: 'get', path: '/admin/export/{entity}', tag: 'Admin', summary: 'CSV eksport: users | trips | bookings | cargo | ride-requests (soatiga 20, jurnalga yoziladi)' },
  { method: 'post', path: '/admin/me/password', tag: 'Admin', summary: 'Admin panel parolini almashtirish (barcha sessiyalar yopiladi)', body: changePasswordBody },
  { method: 'get', path: '/admin/ride-requests', tag: 'Admin', summary: "Safar so'rovlari (yo'lovchi telefoni bilan)", query: adminRideRequestsQuery },
  { method: 'post', path: '/admin/ride-requests/{id}/assign', tag: 'Admin', summary: "Tizimda yo'q haydovchini qo'lda biriktirish — yo'lovchiga xabar boradi", params: idParam, body: assignRideRequestBody },
  { method: 'post', path: '/admin/ride-requests/{id}/cancel', tag: 'Admin', summary: "So'rovni bekor qilish", params: idParam },

  // Telegram bot ichki API'si
  { method: 'post', path: '/internal/bot/login-code', tag: 'Bot (ichki)', summary: "Telegram foydalanuvchisiga kirish kodi (kontakt bilan ro'yxatdan o'tkazadi). Xatolar: PHONE_REQUIRED, PHONE_TAKEN, USER_BLOCKED, LOGIN_CODE_LIMIT", auth: 'bot', body: loginCodeRequestBody },
  { method: 'get', path: '/internal/bot/notifications', tag: 'Bot (ichki)', summary: "Telegram'ga yuborilmagan bildirishnomalar (outbox)", auth: 'bot', query: pendingNotificationsQuery },
  { method: 'post', path: '/internal/bot/notifications/ack', tag: 'Bot (ichki)', summary: 'Yuborilgan deb belgilash', auth: 'bot', body: ackNotificationsBody },
  { method: 'get', path: '/internal/bot/ride-requests/group-queue', tag: 'Bot (ichki)', summary: "Guruhga tashlanadigan (toPost) va yopiladigan (toClose) so'rovlar", auth: 'bot' },
  { method: 'post', path: '/internal/bot/ride-requests/{id}/check', tag: 'Bot (ichki)', summary: "Olaman bosildi: haydovchi va so'rov tekshiruvi", auth: 'bot', params: idParam, body: botTelegramBody },
  { method: 'post', path: '/internal/bot/ride-requests/{id}/take', tag: 'Bot (ichki)', summary: "Haydovchi narxni yozdi — so'rov biriktiriladi, yo'lovchi kontakti qaytadi", auth: 'bot', params: idParam, body: botTakeBody },
  { method: 'post', path: '/internal/bot/ride-requests/{id}/group-posted', tag: 'Bot (ichki)', summary: 'Guruhga tashlandi', auth: 'bot', params: idParam, body: botGroupPostedBody },
  { method: 'post', path: '/internal/bot/ride-requests/{id}/group-closed', tag: 'Bot (ichki)', summary: 'Guruhdagi post yopildi', auth: 'bot', params: idParam },
];

routes.forEach(register);

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Abu Tax API',
      version: '1.0.0',
      description: [
        "Butun O'zbekiston bo'ylab shaharlararo taksi va yuk tashish platformasi.",
        '',
        "**Javob formati:** `{ success: true, data, meta? }` yoki `{ success: false, error: { code, message, fields? } }`.",
        "**Kirish (parolsiz):** foydalanuvchi Telegram botga (@" + env.BOT_USERNAME + ") kirib raqamini yuboradi va 1 daqiqalik 6 belgili kod oladi → `POST /auth/code`. Ro'yxatdan o'tish ham shu: hisob bot tomonidan yaratiladi.",
        "**Til:** `Accept-Language: uz | ru`. **Sanalar:** ISO 8601 (UTC). **Narxlar:** so'm (butun son).",
        '',
        "**Socket.IO:** `io(API_URL, { auth: { token: accessToken } })`. Hodisalar: `booking:new`, `booking:updated`, " +
          '`trip:updated`, `cargo:offer:new`, `cargo:offer:updated`, `cargo:updated`, `driver:status`, `ride:request:new`, `ride:request:assigned`, `ride:request:taken`, `ride:request:updated`, `notification:new`.',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
  });
}
