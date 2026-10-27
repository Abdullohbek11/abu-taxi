import type { Locale } from './i18n.js';

/**
 * Barcha xato kodlari shu yerda. Har kod: HTTP status + uz/ru xabar.
 * Yangi xato qo'shilganda faqat shu obyektga yoziladi.
 */
export const ERRORS = {
  // ── Umumiy ──
  INTERNAL: { status: 500, uz: 'Serverda kutilmagan xatolik yuz berdi', ru: 'Внутренняя ошибка сервера' },
  VALIDATION_ERROR: { status: 400, uz: "Kiritilgan ma'lumotlar noto'g'ri", ru: 'Некорректные данные' },
  NOT_FOUND: { status: 404, uz: 'Topilmadi', ru: 'Не найдено' },
  ROUTE_NOT_FOUND: { status: 404, uz: "So'ralgan manzil mavjud emas", ru: 'Маршрут не найден' },
  RATE_LIMITED: { status: 429, uz: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring", ru: 'Слишком много запросов. Попробуйте позже' },
  INVALID_STATE_TRANSITION: { status: 409, uz: "Bu holatdan o'tish mumkin emas", ru: 'Недопустимый переход статуса' },
  TRY_AGAIN: { status: 503, uz: "Server band. Bir soniyadan keyin qayta urinib ko'ring", ru: 'Сервер занят. Повторите попытку через секунду' },
  CONFLICT: { status: 409, uz: 'Ziddiyat: resurs allaqachon mavjud', ru: 'Конфликт: ресурс уже существует' },

  // ── Auth ──
  UNAUTHORIZED: { status: 401, uz: 'Avtorizatsiyadan o\'ting', ru: 'Требуется авторизация' },
  TOKEN_EXPIRED: { status: 401, uz: 'Sessiya muddati tugagan', ru: 'Срок действия сессии истёк' },
  TOKEN_INVALID: { status: 401, uz: 'Token yaroqsiz', ru: 'Недействительный токен' },
  /** Boshqa tab/ilova sessiyani hozirgina yangiladi — cookie'dagi yangi token bilan qayta urinish kerak */
  REFRESH_IN_PROGRESS: { status: 409, uz: "Sessiya yangilanmoqda, qayta urinib ko'ring", ru: 'Сессия обновляется, повторите попытку' },
  REFRESH_TOKEN_REUSED: { status: 401, uz: 'Xavfsizlik uchun barcha sessiyalar yopildi. Qayta kiring', ru: 'В целях безопасности все сессии завершены. Войдите снова' },
  FORBIDDEN: { status: 403, uz: "Bu amal uchun ruxsat yo'q", ru: 'Недостаточно прав' },
  USER_BLOCKED: { status: 403, uz: 'Hisobingiz bloklangan', ru: 'Ваш аккаунт заблокирован' },
  LOGIN_CODE_INVALID: { status: 400, uz: "Kod noto'g'ri yoki muddati o'tgan. Botdan yangi kod oling", ru: 'Код неверный или истёк. Получите новый код в боте' },
  LOGIN_CODE_LIMIT: { status: 429, uz: "Kod juda ko'p so'raldi. Birozdan keyin urinib ko'ring", ru: 'Код запрашивался слишком часто. Попробуйте позже' },
  LOGIN_ATTEMPTS_LIMIT: { status: 429, uz: "Urinishlar juda ko'p. Birozdan keyin qayta urinib ko'ring", ru: 'Слишком много попыток. Повторите позже' },
  BOT_UNAUTHORIZED: { status: 401, uz: "Bot kaliti noto'g'ri", ru: 'Неверный ключ бота' },
  PHONE_TAKEN: { status: 409, uz: "Bu raqam boshqa hisobga bog'langan", ru: 'Этот номер привязан к другому аккаунту' },
  PHONE_REQUIRED: { status: 409, uz: "Avval telefon raqamingizni botga yuboring", ru: 'Сначала отправьте номер телефона боту' },
  ROLE_CHANGE_NOT_ALLOWED: { status: 409, uz: "Faol safarlaringiz bor — rolni o'zgartirib bo'lmaydi", ru: 'У вас есть активные поездки — роль изменить нельзя' },
  ADMIN_LOGIN_INVALID: { status: 401, uz: "Login yoki parol noto'g'ri", ru: 'Неверный логин или пароль' },
  ADMIN_LOGIN_LOCKED: { status: 429, uz: "Urinishlar juda ko'p. Birozdan keyin qayta urinib ko'ring", ru: 'Слишком много попыток. Повторите позже' },
  WEAK_PASSWORD: { status: 400, uz: 'Parol talablarga javob bermaydi', ru: 'Пароль не соответствует требованиям' },
  PASSWORD_INCORRECT: { status: 400, uz: "Joriy parol noto'g'ri", ru: 'Текущий пароль неверный' },
  ROLE_REQUIRED: { status: 403, uz: 'Avval rolni tanlang', ru: 'Сначала выберите роль' },

  // ── Foydalanuvchi / haydovchi ──
  USER_NOT_FOUND: { status: 404, uz: 'Foydalanuvchi topilmadi', ru: 'Пользователь не найден' },
  DRIVER_NOT_FOUND: { status: 404, uz: 'Haydovchi topilmadi', ru: 'Водитель не найден' },
  DRIVER_ALREADY_REGISTERED: { status: 409, uz: "Siz allaqachon haydovchi sifatida ro'yxatdan o'tgansiz", ru: 'Вы уже зарегистрированы как водитель' },
  DRIVER_NOT_APPROVED: { status: 403, uz: 'Haydovchi hisobingiz hali tasdiqlanmagan', ru: 'Ваш аккаунт водителя ещё не подтверждён' },
  DRIVER_PROFILE_REQUIRED: { status: 403, uz: "Avval haydovchi sifatida ro'yxatdan o'ting", ru: 'Сначала зарегистрируйтесь как водитель' },
  VEHICLE_NOT_APPROVED: { status: 409, uz: 'Mashina hali tasdiqlanmagan', ru: 'Автомобиль ещё не подтверждён' },
  VEHICLE_PHOTOS_LIMIT: { status: 400, uz: "Mashinaga ko'pi bilan 6 ta rasm yuklash mumkin", ru: 'Можно загрузить не более 6 фото автомобиля' },
  CANNOT_BLOCK_ADMIN: { status: 403, uz: "Administratorni bloklab bo'lmaydi", ru: 'Нельзя заблокировать администратора' },
  VEHICLE_NOT_FOUND: { status: 404, uz: 'Mashina topilmadi', ru: 'Автомобиль не найден' },
  VEHICLE_PLATE_TAKEN: { status: 409, uz: "Bu davlat raqami allaqachon ro'yxatda bor", ru: 'Этот госномер уже зарегистрирован' },
  VEHICLE_IN_USE: { status: 409, uz: 'Mashinada faol safarlar bor', ru: 'У автомобиля есть активные поездки' },
  DOCUMENT_NOT_FOUND: { status: 404, uz: 'Hujjat topilmadi', ru: 'Документ не найден' },
  FILE_REQUIRED: { status: 400, uz: 'Fayl yuklanmadi', ru: 'Файл не загружен' },
  FILE_TOO_LARGE: { status: 413, uz: 'Fayl hajmi 5MB dan oshmasligi kerak', ru: 'Размер файла не должен превышать 5 МБ' },
  IMAGE_TOO_LARGE: { status: 413, uz: "Rasm o'lchami juda katta (40 megapikselgacha)", ru: 'Слишком большое разрешение (до 40 мегапикселей)' },
  FILE_TYPE_NOT_ALLOWED: { status: 415, uz: 'Faqat JPG, PNG yoki WEBP rasm yuklash mumkin', ru: 'Допустимы только изображения JPG, PNG или WEBP' },

  // ── Shaharlar ──
  CITY_NOT_FOUND: { status: 404, uz: 'Shahar topilmadi', ru: 'Город не найден' },
  SAME_CITY: { status: 400, uz: "Jo'nash va borish manzili bir xil bo'lmasligi kerak", ru: 'Пункты отправления и назначения не должны совпадать' },

  // ── Safarlar ──
  TRIP_NOT_FOUND: { status: 404, uz: 'Safar topilmadi', ru: 'Поездка не найдена' },
  TRIP_FULL: { status: 409, uz: "Safarda bo'sh o'rin qolmadi", ru: 'В поездке нет свободных мест' },
  SEAT_TAKEN: { status: 409, uz: "Tanlangan o'rin allaqachon band qilingan. Boshqa o'rinni tanlang", ru: 'Выбранное место уже занято. Выберите другое' },
  SEAT_INVALID: { status: 400, uz: "Bunday o'rin yo'q", ru: 'Такого места нет' },
  SEAT_PRICES_MISMATCH: { status: 400, uz: "Har bir o'rin uchun narx ko'rsatilishi kerak", ru: 'Нужно указать цену для каждого места' },
  TRIP_NOT_BOOKABLE: { status: 409, uz: "Bu safarni band qilib bo'lmaydi", ru: 'Эту поездку нельзя забронировать' },
  TRIP_DEPARTURE_IN_PAST: { status: 400, uz: "Jo'nash vaqti kelajakda bo'lishi kerak", ru: 'Время отправления должно быть в будущем' },
  TRIP_HAS_BOOKINGS: { status: 409, uz: "Tasdiqlangan band qilishlar bor — bu maydonni o'zgartirib bo'lmaydi", ru: 'Есть подтверждённые брони — это поле нельзя изменить' },
  TRIP_START_TOO_EARLY: { status: 409, uz: "Safarni jo'nash vaqtidan 2 soat oldin boshlash mumkin", ru: 'Поездку можно начать не ранее чем за 2 часа до отправления' },
  SEATS_BELOW_BOOKED: { status: 409, uz: "O'rinlar soni band qilinganlardan kam bo'lishi mumkin emas", ru: 'Мест не может быть меньше, чем уже забронировано' },
  SEATS_EXCEED_VEHICLE: { status: 400, uz: "O'rinlar soni mashina sig'imidan oshmasligi kerak", ru: 'Количество мест не может превышать вместимость автомобиля' },

  // ── Band qilish ──
  BOOKING_NOT_FOUND: { status: 404, uz: 'Band qilish topilmadi', ru: 'Бронирование не найдено' },
  CANNOT_BOOK_OWN_TRIP: { status: 403, uz: "O'z safaringizni band qila olmaysiz", ru: 'Нельзя бронировать собственную поездку' },
  TOO_MANY_ACTIVE_BOOKINGS: { status: 429, uz: "Tasdiqlanmagan band qilishlaringiz juda ko'p. Haydovchi javobini kuting yoki birini bekor qiling", ru: 'Слишком много неподтверждённых броней. Дождитесь ответа водителя или отмените одну' },
  TOO_MANY_ACTIVE_TRIPS: { status: 429, uz: "Faol safarlaringiz juda ko'p (20 tagacha)", ru: 'Слишком много активных поездок (до 20)' },
  TOO_MANY_OPEN_CARGO: { status: 429, uz: "Ochiq yuk so'rovlaringiz juda ko'p (10 tagacha)", ru: 'Слишком много открытых заявок на груз (до 10)' },
  DRIVER_DOCUMENTS_MISSING: { status: 409, uz: 'Haydovchida guvohnoma va texpasport yuklanmagan', ru: 'У водителя не загружены права и техпаспорт' },
  BOOKING_ALREADY_EXISTS: { status: 409, uz: 'Bu safarda sizning faol band qilishingiz bor', ru: 'У вас уже есть активная бронь на эту поездку' },

  // ── Yuk ──
  CARGO_NOT_FOUND: { status: 404, uz: "Yuk so'rovi topilmadi", ru: 'Заявка на груз не найдена' },
  CARGO_NOT_OPEN: { status: 409, uz: "Yuk so'rovi takliflar uchun yopiq", ru: 'Заявка на груз закрыта для предложений' },
  CANNOT_OFFER_OWN_CARGO: { status: 403, uz: "O'z yukingizga taklif bera olmaysiz", ru: 'Нельзя делать предложение на собственный груз' },
  CARGO_DATE_IN_PAST: { status: 400, uz: "Yuk jo'natish sanasi o'tib ketgan", ru: 'Дата отправки груза уже прошла' },
  CARGO_PHOTOS_LIMIT: { status: 400, uz: "Yukka ko'pi bilan 5 ta rasm yuklash mumkin", ru: 'Можно загрузить не более 5 фото груза' },
  TRIP_NOT_ACCEPTING_CARGO: { status: 409, uz: 'Bu safar yuk qabul qilmaydi', ru: 'Эта поездка не принимает груз' },
  OFFER_NOT_FOUND: { status: 404, uz: 'Taklif topilmadi', ru: 'Предложение не найдено' },
  OFFER_ALREADY_EXISTS: { status: 409, uz: 'Bu yukka faol taklifingiz bor', ru: 'У вас уже есть активное предложение на этот груз' },

  // ── Safar so'rovlari ──
  RIDE_REQUEST_NOT_FOUND: { status: 404, uz: "So'rov topilmadi", ru: 'Заявка не найдена' },
  RIDE_REQUEST_NOT_OPEN: { status: 409, uz: "Bu so'rov allaqachon olingan yoki yopilgan", ru: 'Эта заявка уже принята или закрыта' },
  RIDE_REQUEST_DATE_IN_PAST: { status: 400, uz: "Sana o'tib ketgan", ru: 'Дата уже прошла' },
  TOO_MANY_RIDE_REQUESTS: { status: 429, uz: "Ochiq so'rovlaringiz juda ko'p (3 tagacha)", ru: 'Слишком много открытых заявок (до 3)' },
  RIDE_REQUEST_DAILY_LIMIT: { status: 429, uz: "Bugun juda ko'p so'rov yubordingiz. Ertaga urinib ko'ring", ru: 'Сегодня отправлено слишком много заявок. Попробуйте завтра' },
  CANNOT_TAKE_OWN_REQUEST: { status: 403, uz: "O'z so'rovingizni ola olmaysiz", ru: 'Нельзя принять собственную заявку' },

  // ── Tarif va to'lovlar ──
  SUBSCRIPTION_REQUIRED: { status: 402, uz: "Yo'lovchi va yuk olish uchun tarifni to'lang (30 kun)", ru: 'Чтобы брать пассажиров и грузы, оплатите тариф (30 дней)' },
  PAYMENT_NOT_FOUND: { status: 404, uz: "To'lov topilmadi", ru: 'Платёж не найден' },
  PAYMENT_ALREADY_PENDING: { status: 409, uz: "Oldingi to'lovingiz tekshirilmoqda. Admin tasdiqlashini kuting", ru: 'Предыдущий платёж ещё проверяется. Дождитесь подтверждения' },
  PAYMENT_PROVIDER_DISABLED: { status: 409, uz: "Bu to'lov usuli hozircha ulanmagan", ru: 'Этот способ оплаты пока не подключён' },
  BILLING_DISABLED: { status: 409, uz: "Tarif hozircha o'chirilgan — xizmat bepul", ru: 'Тариф пока отключён — сервис бесплатный' },

  // ── Sharhlar ──
  REVIEW_NOT_ALLOWED: { status: 403, uz: "Bu safar/yuk uchun sharh qoldira olmaysiz", ru: 'Вы не можете оставить отзыв по этой поездке/грузу' },
  REVIEW_WINDOW_CLOSED: { status: 409, uz: "Sharh qoldirish muddati (14 kun) o'tgan", ru: 'Срок для отзыва (14 дней) истёк' },
  REVIEW_ALREADY_EXISTS: { status: 409, uz: 'Siz allaqachon sharh qoldirgansiz', ru: 'Вы уже оставили отзыв' },

  // ── Bildirishnomalar ──
  NOTIFICATION_NOT_FOUND: { status: 404, uz: 'Bildirishnoma topilmadi', ru: 'Уведомление не найдено' },
} as const satisfies Record<string, { status: number; uz: string; ru: string }>;

export type ErrorCode = keyof typeof ERRORS;

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;
  /** 429/503 uchun: mijoz necha soniyadan keyin qayta urinishi mumkin (Retry-After) */
  readonly retryAfter?: number;

  constructor(code: ErrorCode, fields?: FieldErrors, opts: { retryAfter?: number } = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = ERRORS[code].status;
    this.fields = fields;
    this.retryAfter = opts.retryAfter;
  }
}

export function errorMessage(code: ErrorCode, locale: Locale): string {
  return ERRORS[code][locale];
}
