import type { Lang, RideSummary, RideTaken } from './api.js';

/** Telegram HTML rejimi uchun: matn teg sifatida talqin qilinmasligi kerak. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Telegram language_code → bot tili (backend'dagi saqlangan til ustun turadi). */
export function langFromTelegram(code: string | undefined): Lang {
  return code?.toLowerCase().startsWith('ru') ? 'RU' : 'UZ';
}


const MONTHS = {
  UZ: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  RU: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const WEEKDAYS = {
  UZ: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
  RU: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
};

/** ISO sana → "21-oktabr, seshanba" (Toshkent vaqti, UTC+5). */
export function formatDay(iso: unknown, lang: Lang): string {
  const d = new Date(new Date(String(iso)).getTime() + 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const month = MONTHS[lang][d.getUTCMonth()];
  const weekday = WEEKDAYS[lang][d.getUTCDay()];
  return lang === 'UZ' ? `${day}-${month}, ${weekday}` : `${day} ${month}, ${weekday}`;
}

/** 150000 → "150 000" */
export function formatPrice(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '';
}

/** +998901234567 → +998 90 123 45 67 */
export function formatPhone(v: unknown): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(String(v ?? ''));
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : String(v ?? '');
}

/**
 * Haydovchi yozgan narx: "150000", "150 000", "150.000" yoki qisqa "150" (= 150 000).
 * null — tushunarsiz yoki chegaradan tashqari.
 */
export function parsePrice(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/so['ʻ‘’`]?m|сум|sum/g, '').trim();
  if (!/^\d[\d\s.,]*$/.test(t)) return null;
  let n = Number(t.replace(/[\s.,]/g, ''));
  if (n > 0 && n < 10_000) n *= 1000;
  return n >= 10_000 && n <= 5_000_000 ? n : null;
}

type City = { uz: string; ru: string };
const cityName = (c: unknown, lang: Lang) => esc((c as City | undefined)?.[lang === 'UZ' ? 'uz' : 'ru'] ?? '');

/** So'rovning asosiy qatorlari: yo'nalish, sana, odam soni, taklif narxi, izoh. */
function rideLines(r: Partial<RideSummary>, lang: Lang): string {
  const uz = lang === 'UZ';
  const lines = [
    `📍 <b>${cityName(r.from, lang)} → ${cityName(r.to, lang)}</b>`,
    `📅 ${formatDay(r.date, lang)}`,
    `👥 ${esc(r.seats)} ${uz ? 'kishi' : 'чел.'}`,
  ];
  if (r.offeredPrice) lines.push(uz ? `💰 Taklif: ${formatPrice(r.offeredPrice)} so'm / kishi` : `💰 Предлагает: ${formatPrice(r.offeredPrice)} сум / чел.`);
  if (r.note) lines.push(`📝 ${esc(r.note)}`);
  return lines.join('\n');
}

/** Guruhga tashlanadigan post (o'zbekcha; telefon yo'q). */
export function groupPostText(r: RideSummary): string {
  return `🚕 <b>Yangi yo'lovchi</b>\n\n${rideLines(r, 'UZ')}\n\nOlish uchun «🙋 Olaman» tugmasini bosing — bot narxni so'raydi va yo'lovchi raqamini beradi.`;
}

/** Guruhdagi post yopilganda tugma o'rniga. */
export function groupClosedLabel(status: string): string {
  return status === 'ASSIGNED' ? '✅ Haydovchi topildi' : status === 'EXPIRED' ? "⌛️ Muddati o'tdi" : '❌ Bekor qilindi';
}

/** Haydovchidan narx so'rash. */
export function askPriceText(r: RideSummary, lang: Lang): string {
  return lang === 'UZ'
    ? `${rideLines(r, lang)}\n\n💬 <b>Narxni yozing</b> — bir kishi uchun, so'mda. Masalan: <code>150000</code> yoki <code>150</code>.`
    : `${rideLines(r, lang)}\n\n💬 <b>Напишите цену</b> — за одного человека, в сумах. Например: <code>150000</code> или <code>150</code>.`;
}

/** Haydovchi so'rovni oldi: yo'lovchi kontakti. */
export function takenText(r: RideTaken, lang: Lang): string {
  const uz = lang === 'UZ';
  const contact = [
    `👤 <b>${esc(r.passengerName)}</b>`,
    r.phone ? `📞 ${esc(formatPhone(r.phone))}` : null,
    r.telegramUsername ? `✈️ @${esc(r.telegramUsername)}` : null,
  ].filter(Boolean).join('\n');
  return uz
    ? `✅ <b>So'rov sizga biriktirildi!</b>\n\n${contact}\n\n${rideLines(r, lang)}\n💵 Sizning narxingiz: ${formatPrice(r.pricePerSeat)} so'm / kishi\n\nYo'lovchiga ismingiz, mashinangiz va raqamingiz yuborildi. Iltimos, u bilan bog'laning.`
    : `✅ <b>Заявка закреплена за вами!</b>\n\n${contact}\n\n${rideLines(r, lang)}\n💵 Ваша цена: ${formatPrice(r.pricePerSeat)} сум / чел.\n\nПассажиру отправлены ваше имя, автомобиль и номер. Пожалуйста, свяжитесь с ним.`;
}

const T = {
  UZ: {
    welcome:
      "Assalomu alaykum! 👋\n\n<b>Abu Tax</b> — butun O'zbekiston bo'ylab shaharlararo safarlar va yuk tashish, haydovchi bilan to'g'ridan-to'g'ri.\n\nSaytga kirish uchun telefon raqamingizni yuboring — pastdagi tugmani bosing.",
    shareContact: '📱 Raqamni yuborish',
    getCode: '🔑 Kod olish',
    newCode: '🔄 Yangi kod',
    openSite: "🌐 Saytga o'tish",
    code: (code: string, sec: number) =>
      `🔑 Kirish kodingiz:\n\n<code>${esc(code)}</code>\n\n⏱ ${Math.round(sec / 60) || 1} daqiqa amal qiladi. Kodni saytdagi maydonga kiriting.\n⚠️ Kodni hech kimga bermang — Abu Tax xodimlari uni so'ramaydi.`,
    notOwnContact: "❗️ Iltimos, faqat <b>o'zingizning</b> raqamingizni pastdagi tugma orqali yuboring.",
    notUzPhone: "❗️ Hozircha faqat O'zbekiston raqamlari (+998) qo'llab-quvvatlanadi.",
    phoneTaken: "❗️ Bu raqam boshqa Telegram akkauntga bog'langan. Yordam uchun @abutax_uz ga yozing.",
    blocked: '⛔️ Hisobingiz bloklangan. Yordam uchun @abutax_uz ga yozing.',
    tooMany: (sec?: number) => `⏳ Kod juda ko'p so'raldi. ${sec ? `${Math.ceil(sec / 60)} daqiqadan` : 'Birozdan'} keyin urinib ko'ring.`,
    error: "😔 Xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.",
    help: "Saytga kirish: <b>🔑 Kod olish</b> tugmasini bosing va kodni saytga kiriting.\n\nSavollar bo'yicha: @abutax_uz",
    take: '🙋 Olaman',
    takeAt: (price: string) => `✅ ${price} so'm / kishi`,
    priceInvalid: "❗️ Narxni raqam bilan yozing, masalan <code>150000</code> (10 000 – 5 000 000 so'm).",
    rideNotOpen: "😔 Bu so'rovni boshqa haydovchi olib bo'ldi yoki u bekor qilingan.",
    rideNotDriver: "🚗 So'rovlarni olish uchun Abu Tax'da <b>haydovchi</b> sifatida ro'yxatdan o'ting va hujjatlaringiz tasdiqlanishini kuting.",
    rideNotApproved: '⏳ Haydovchi hisobingiz hali tasdiqlanmagan. Tasdiqlangach, so\'rovlarni olishingiz mumkin.',
    rideNoVehicle: "🚗 Tasdiqlangan mashinangiz yo'q. Saytda mashina qo'shing va tasdiqni kuting.",
    rideOwn: "Bu sizning so'rovingiz 🙂",
    subscriptionRequired: (url: string) => `💳 Yo'lovchilarni olish uchun 30 kunlik tarifni to'lang.\n\nTo'lov: ${esc(url)}`,
  },
  RU: {
    welcome:
      'Здравствуйте! 👋\n\n<b>Abu Tax</b> — междугородние поездки и грузоперевозки по всему Узбекистану, напрямую с водителем.\n\nЧтобы войти на сайт, отправьте свой номер телефона — нажмите кнопку ниже.',
    shareContact: '📱 Отправить номер',
    getCode: '🔑 Получить код',
    newCode: '🔄 Новый код',
    openSite: '🌐 Перейти на сайт',
    code: (code: string, sec: number) =>
      `🔑 Ваш код для входа:\n\n<code>${esc(code)}</code>\n\n⏱ Действует ${Math.round(sec / 60) || 1} мин. Введите код на сайте.\n⚠️ Никому не сообщайте код — сотрудники Abu Tax его не спрашивают.`,
    notOwnContact: '❗️ Пожалуйста, отправьте <b>свой</b> номер с помощью кнопки ниже.',
    notUzPhone: '❗️ Пока поддерживаются только номера Узбекистана (+998).',
    phoneTaken: '❗️ Этот номер привязан к другому Telegram-аккаунту. Напишите в поддержку: @abutax_uz',
    blocked: '⛔️ Ваш аккаунт заблокирован. Поддержка: @abutax_uz',
    tooMany: (sec?: number) => `⏳ Слишком много запросов кода. Попробуйте ${sec ? `через ${Math.ceil(sec / 60)} мин.` : 'чуть позже'}.`,
    error: '😔 Произошла ошибка. Попробуйте чуть позже.',
    help: 'Вход на сайт: нажмите <b>🔑 Получить код</b> и введите код на сайте.\n\nВопросы: @abutax_uz',
    take: '🙋 Беру',
    takeAt: (price: string) => `✅ ${price} сум / чел.`,
    priceInvalid: '❗️ Напишите цену числом, например <code>150000</code> (10 000 – 5 000 000 сум).',
    rideNotOpen: '😔 Эту заявку уже взял другой водитель или она отменена.',
    rideNotDriver: '🚗 Чтобы брать заявки, зарегистрируйтесь в Abu Tax как <b>водитель</b> и дождитесь проверки документов.',
    rideNotApproved: '⏳ Ваш аккаунт водителя ещё не подтверждён. После проверки вы сможете брать заявки.',
    rideNoVehicle: '🚗 У вас нет подтверждённого автомобиля. Добавьте автомобиль на сайте и дождитесь проверки.',
    rideOwn: 'Это ваша заявка 🙂',
    subscriptionRequired: (url: string) => `💳 Чтобы брать пассажиров, оплатите тариф на 30 дней.\n\nОплата: ${esc(url)}`,
  },
} as const;

export function t(lang: Lang) {
  return T[lang];
}

/** Ikkala tildagi tugma matnlari — foydalanuvchi qaysi tilda bosganidan qat'i nazar tanib olish uchun. */
export const BUTTONS = {
  getCode: [T.UZ.getCode, T.RU.getCode] as string[],
};

type Payload = Record<string, unknown> & { status?: string };

/**
 * Bildirishnoma matni (faqat muhim hodisalar). null — Telegram'ga yuborilmaydi.
 * Backend hodisani bazaga yozadi, bot navbatdan olib yuboradi.
 */
export function notificationText(type: string, p: Payload, lang: Lang): string | null {
  const uz = lang === 'UZ';
  switch (type) {
    case 'booking:new':
      return uz
        ? `🆕 Yangi band qilish: ${esc(p.seats)} o'rin. Saytda tasdiqlang.`
        : `🆕 Новая бронь: ${esc(p.seats)} мест. Подтвердите на сайте.`;
    case 'booking:updated':
      if (p.status === 'CONFIRMED') return uz ? '✅ Band qilishingiz tasdiqlandi. Haydovchi raqami saytda.' : '✅ Ваша бронь подтверждена. Номер водителя на сайте.';
      if (p.status === 'REJECTED') return uz ? '❌ Band qilishingiz rad etildi.' : '❌ Ваша бронь отклонена.';
      if (p.status === 'CANCELLED') return uz ? "Yo'lovchi band qilishni bekor qildi." : 'Пассажир отменил бронь.';
      return null;
    case 'trip:updated':
      if (p.status === 'CANCELLED') return uz ? '⚠️ Safar bekor qilindi.' : '⚠️ Поездка отменена.';
      return null;
    case 'cargo:offer:new':
      return uz ? `🚚 Yukingizga yangi taklif: ${esc(p.price)} so'm.` : `🚚 Новое предложение на ваш груз: ${esc(p.price)} сум.`;
    case 'cargo:offer:updated':
      if (p.status === 'ACCEPTED') return uz ? '✅ Taklifingiz qabul qilindi. Mijoz raqami saytda.' : '✅ Ваше предложение принято. Номер клиента на сайте.';
      return null;
    case 'driver:status':
      if (p.status === 'APPROVED') return uz ? "✅ Haydovchi hisobingiz tasdiqlandi. Endi safar e'lon qilishingiz mumkin." : '✅ Ваш аккаунт водителя подтверждён.';
      if (p.status === 'REJECTED') return uz ? `❌ Hujjatlaringiz rad etildi: ${esc(p.reason)}` : `❌ Документы отклонены: ${esc(p.reason)}`;
      return null;
    case 'ride:request:new':
      return uz
        ? `🔔 <b>Yangi yo'lovchi</b> — sizning yo'nalishingizda\n\n${rideLines(p as Partial<RideSummary>, lang)}\n\nOlish uchun «🙋 Olaman» tugmasini bosing va narxni yozing.`
        : `🔔 <b>Новый пассажир</b> — по вашему направлению\n\n${rideLines(p as Partial<RideSummary>, lang)}\n\nНажмите «🙋 Беру» и напишите цену.`;
    case 'ride:request:assigned': {
      const car = [p.carModel, p.carColor].filter(Boolean).map(esc).join(', ');
      const lines = [
        uz ? `Sizni <b>${esc(p.driverName)}</b> olib ketadi.` : `Вас отвезёт <b>${esc(p.driverName)}</b>.`,
        car ? `🚗 ${car}` : null,
        p.carPlate ? `🔢 ${esc(p.carPlate)}` : null,
        uz ? `💰 Narxi: <b>${formatPrice(p.pricePerSeat)} so'm</b> (kishi boshiga)` : `💰 Цена: <b>${formatPrice(p.pricePerSeat)} сум</b> (за человека)`,
        p.phone ? `📞 ${esc(formatPhone(p.phone))}` : null,
        p.telegramUsername ? `✈️ @${esc(p.telegramUsername)}` : null,
      ].filter(Boolean).join('\n');
      return uz
        ? `🚕 <b>Haydovchi topildi!</b>\n\n${lines}\n\n${rideLines({ ...(p as Partial<RideSummary>), offeredPrice: null, note: null }, lang)}\n\nHaydovchi siz bilan bog'lanadi. Oq yo'l!`
        : `🚕 <b>Водитель найден!</b>\n\n${lines}\n\n${rideLines({ ...(p as Partial<RideSummary>), offeredPrice: null, note: null }, lang)}\n\nВодитель свяжется с вами. Счастливого пути!`;
    }
    case 'ride:request:taken':
      return takenText(p as unknown as RideTaken, lang);
    case 'billing:activated':
      return uz
        ? `✅ <b>Tarif faollashdi!</b>\nYo'lovchi va yuklarni ${formatDay(p.until, lang)} gacha olishingiz mumkin. Oq yo'l!`
        : `✅ <b>Тариф активирован!</b>\nВы можете брать пассажиров и грузы до ${formatDay(p.until, lang)}.`;
    case 'billing:rejected':
      return uz ? `❌ To'lov tasdiqlanmadi: ${esc(p.reason)}\nSavol bo'lsa, adminga yozing.` : `❌ Платёж не подтверждён: ${esc(p.reason)}`;
    case 'billing:expiring':
      return uz
        ? `⏳ Tarifingiz ${formatDay(p.until, lang)} da tugaydi. Yo'lovchilarni yo'qotmaslik uchun oldindan to'lang.`
        : `⏳ Тариф заканчивается ${formatDay(p.until, lang)}. Продлите заранее, чтобы не терять пассажиров.`;
    case 'billing:expired':
      return uz ? "⛔️ Tarifingiz tugadi. Yo'lovchilarni olish uchun saytda to'lov qiling." : '⛔️ Тариф закончился. Оплатите на сайте, чтобы брать пассажиров.';
    case 'billing:payment:new':
      return uz
        ? `💳 Yangi to'lov: <b>${esc(p.driverName)}</b> — ${formatPrice(p.amount)} so'm${p.hasReceipt ? ' (chek bilan)' : ''}.\nAdmin panel → To'lovlar.`
        : `💳 Новый платёж: <b>${esc(p.driverName)}</b> — ${formatPrice(p.amount)} сум. Админ-панель → Платежи.`;
    case 'security:admin-login':
      return uz
        ? `🔐 Admin panelga parol bilan kirildi.\nIP: <code>${esc(p.ip ?? '—')}</code>\n\nBu siz bo'lmasangiz, darhol parolni almashtiring: <code>admin password</code>.`
        : `🔐 Выполнен вход в админ-панель по паролю.\nIP: <code>${esc(p.ip ?? '—')}</code>\n\nЕсли это были не вы, срочно смените пароль: <code>admin password</code>.`;
    case 'ride:request:updated':
      if (p.status === 'CANCELLED') return uz ? "❌ Safar so'rovi bekor qilindi." : '❌ Заявка на поездку отменена.';
      if (p.status === 'EXPIRED')
        return uz
          ? "😔 Afsuski, so'rovingizga haydovchi topilmadi. Saytda boshqa sana bilan qayta urinib ko'ring."
          : '😔 К сожалению, водитель не нашёлся. Попробуйте другую дату на сайте.';
      return null;
    default:
      return null;
  }
}
