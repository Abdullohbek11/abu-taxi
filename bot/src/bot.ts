import { Bot, InlineKeyboard, Keyboard, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { ApiError, type BackendApi, type Lang, type TelegramProfile } from './api.js';
import { normalizeUzPhone } from './phone.js';
import { askPriceText, BUTTONS, formatPrice, langFromTelegram, parsePrice, t, takenText } from './texts.js';

/** Haydovchi "Olaman" bosgandan keyin narx yozishini kutish muddati. */
const PRICE_WAIT_MS = 10 * 60_000;

export interface BotDeps {
  api: BackendApi;
  webUrl: string;
  log?: (msg: string, err?: unknown) => void;
}

/** Telegram tugmasi faqat haqiqiy domen bilan ishlaydi (localhost/http'ni rad etadi). */
function siteButtonUrl(webUrl: string): string | null {
  try {
    const u = new URL(webUrl);
    if (u.protocol !== 'https:' || u.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null;
    return new URL('/login', u).toString();
  } catch {
    return null;
  }
}

function profileOf(ctx: Context): TelegramProfile {
  const from = ctx.from!;
  return {
    telegramId: String(from.id),
    firstName: from.first_name,
    lastName: from.last_name,
    username: from.username,
    languageCode: from.language_code,
  };
}

const contactKeyboard = (lang: Lang) => new Keyboard().requestContact(t(lang).shareContact).resized().oneTime();
const mainKeyboard = (lang: Lang) => new Keyboard().text(t(lang).getCode).resized().persistent();

/**
 * Bot: Abu Tax'ga kirish kodi (OTP) beradi.
 *  1) /start → raqam hali tasdiqlanmagan bo'lsa — "Raqamni yuborish" (Telegram kontakt tugmasi).
 *  2) Kontakt faqat o'ziniki bo'lsa (contact.user_id === from.id) va +998 bo'lsa qabul qilinadi.
 *  3) Backend 1 daqiqalik kod yaratadi, bot uni yuboradi. Kodni saytdagi maydonga kiritiladi.
 */
export function createBot(token: string, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const log = deps.log ?? ((msg, err) => console.error(msg, err));
  const siteUrl = siteButtonUrl(deps.webUrl);
  const tariffUrl = `${deps.webUrl.replace(/\/$/, '')}/driver/tariff`;

  // Faqat shaxsiy chat — guruhlarda kod yuborilmaydi
  const pm = bot.chatType('private');

  /** Narx kutilayotgan haydovchilar: telegramId → so'rov (bot qayta ishga tushsa — "Olaman" qayta bosiladi). */
  const awaitingPrice = new Map<number, { requestId: string; until: number }>();

  async function replyRideError(ctx: Context, err: unknown, lang: Lang) {
    const L = t(lang);
    if (err instanceof ApiError) {
      switch (err.code) {
        case 'DRIVER_PROFILE_REQUIRED':
        case 'DRIVER_NOT_FOUND':
        case 'ROLE_REQUIRED':
          return void (await ctx.reply(L.rideNotDriver, { parse_mode: 'HTML' }));
        case 'DRIVER_NOT_APPROVED':
          return void (await ctx.reply(L.rideNotApproved));
        case 'VEHICLE_NOT_APPROVED':
          return void (await ctx.reply(L.rideNoVehicle));
        case 'RIDE_REQUEST_NOT_OPEN':
        case 'RIDE_REQUEST_NOT_FOUND':
          return void (await ctx.reply(L.rideNotOpen));
        case 'CANNOT_TAKE_OWN_REQUEST':
          return void (await ctx.reply(L.rideOwn));
        case 'USER_BLOCKED':
          return void (await ctx.reply(L.blocked));
        case 'SUBSCRIPTION_REQUIRED':
          return void (await ctx.reply(L.subscriptionRequired(tariffUrl), { parse_mode: 'HTML' }));
        case 'VALIDATION_ERROR':
          return void (await ctx.reply(L.priceInvalid, { parse_mode: 'HTML' }));
      }
    }
    log("So'rovni olishda xato", err);
    await ctx.reply(L.error);
  }

  /** "Olaman": haydovchi tekshiriladi va narx so'raladi (taklif narxi bo'lsa — bitta bosishda qabul qilish tugmasi). */
  async function startTake(ctx: Context, requestId: string) {
    const lang = langFromTelegram(ctx.from?.language_code);
    try {
      const r = await deps.api.rideCheck(requestId, String(ctx.from!.id));
      awaitingPrice.set(ctx.from!.id, { requestId, until: Date.now() + PRICE_WAIT_MS });
      const kb = r.offeredPrice ? new InlineKeyboard().text(t(lang).takeAt(formatPrice(r.offeredPrice)), `rp:${requestId}:${r.offeredPrice}`) : undefined;
      await ctx.reply(askPriceText(r, lang), { parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) });
    } catch (err) {
      await replyRideError(ctx, err, lang);
    }
  }

  async function finishTake(ctx: Context, requestId: string, price: number) {
    const lang = langFromTelegram(ctx.from?.language_code);
    try {
      const res = await deps.api.rideTake(requestId, String(ctx.from!.id), price);
      awaitingPrice.delete(ctx.from!.id);
      await ctx.reply(takenText(res, lang), { parse_mode: 'HTML' });
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'VALIDATION_ERROR') awaitingPrice.delete(ctx.from!.id);
      await replyRideError(ctx, err, lang);
    }
  }

  async function sendCode(ctx: Context, phone?: string) {
    const fallbackLang = langFromTelegram(ctx.from?.language_code);
    try {
      const res = await deps.api.requestLoginCode({ ...profileOf(ctx), ...(phone ? { phone } : {}) });
      const kb = new InlineKeyboard().text(t(res.lang).newCode, 'new_code');
      if (siteUrl) kb.url(t(res.lang).openSite, siteUrl);
      // Asosiy klaviatura ("Kod olish") va kod xabari
      if (phone) await ctx.reply('✅', { reply_markup: mainKeyboard(res.lang) });
      await ctx.reply(t(res.lang).code(res.code, res.expiresIn), { parse_mode: 'HTML', reply_markup: kb });
    } catch (err) {
      await replyError(ctx, err, fallbackLang);
    }
  }

  async function replyError(ctx: Context, err: unknown, lang: Lang) {
    const L = t(lang);
    if (err instanceof ApiError) {
      switch (err.code) {
        case 'PHONE_REQUIRED':
          return void (await ctx.reply(L.welcome, { parse_mode: 'HTML', reply_markup: contactKeyboard(lang) }));
        case 'PHONE_TAKEN':
          return void (await ctx.reply(L.phoneTaken, { parse_mode: 'HTML' }));
        case 'USER_BLOCKED':
          return void (await ctx.reply(L.blocked));
        case 'LOGIN_CODE_LIMIT':
        case 'RATE_LIMITED':
          return void (await ctx.reply(L.tooMany(err.retryAfter)));
      }
    }
    log('Kod berishda xato', err);
    await ctx.reply(L.error);
  }

  pm.command('start', (ctx) => {
    // Guruhdagi "Olaman" tugmasi: t.me/<bot>?start=rr_<id>
    const m = /^rr_([a-z0-9]{10,40})$/i.exec(ctx.match.trim());
    return m ? startTake(ctx, m[1]!) : sendCode(ctx);
  });
  pm.command('code', (ctx) => sendCode(ctx));
  pm.command('help', (ctx) => ctx.reply(t(langFromTelegram(ctx.from.language_code)).help, { parse_mode: 'HTML' }));
  pm.hears(BUTTONS.getCode, (ctx) => sendCode(ctx));

  pm.on('message:contact', async (ctx) => {
    const lang = langFromTelegram(ctx.from.language_code);
    const contact = ctx.message.contact;
    // Telegram kontakt tugmasi orqali yuborilgan o'z raqami — user_id mos keladi.
    // Boshqa odamning kontaktini ulashish orqali begona raqamga hisob ochishning oldi olinadi.
    if (contact.user_id !== ctx.from.id) {
      return void (await ctx.reply(t(lang).notOwnContact, { parse_mode: 'HTML', reply_markup: contactKeyboard(lang) }));
    }
    const phone = normalizeUzPhone(contact.phone_number);
    if (!phone) return void (await ctx.reply(t(lang).notUzPhone));
    await sendCode(ctx, phone);
  });

  bot.callbackQuery('new_code', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type === 'private') await sendCode(ctx);
  });

  // Shaxsiy xabardagi "Olaman" (yo'nalishdagi haydovchilarga yuborilgan)
  bot.callbackQuery(/^rr:([a-z0-9]{10,40})$/i, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type === 'private') await startTake(ctx, ctx.match[1]!);
  });

  // Taklif qilingan narxga rozi bo'lish
  bot.callbackQuery(/^rp:([a-z0-9]{10,40}):(\d{5,7})$/i, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type === 'private') await finishTake(ctx, ctx.match[1]!, Number(ctx.match[2]));
  });

  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

  // Haydovchi narxni yozdi
  pm.on('message:text', async (ctx, next) => {
    const wait = awaitingPrice.get(ctx.from.id);
    if (!wait || wait.until < Date.now() || ctx.message.text.startsWith('/')) return next();
    const price = parsePrice(ctx.message.text);
    if (!price) return void (await ctx.reply(t(langFromTelegram(ctx.from.language_code)).priceInvalid, { parse_mode: 'HTML' }));
    await finishTake(ctx, wait.requestId, price);
  });

  // Guruh ID'sini bilish uchun (bot/.env dagi GROUP_CHAT_ID)
  bot.chatType(['group', 'supergroup']).command('chatid', (ctx) =>
    ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>\n\nBuni bot/.env dagi GROUP_CHAT_ID ga yozing.`, { parse_mode: 'HTML' }),
  );
  bot.on('my_chat_member', (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === 'member' || status === 'administrator') {
      log(`Bot "${'title' in ctx.chat ? ctx.chat.title : ''}" chatiga qo'shildi. GROUP_CHAT_ID=${ctx.chat.id}`);
    }
  });

  bot.catch((e) => log('Bot xatosi', e.error));
  return bot;
}
