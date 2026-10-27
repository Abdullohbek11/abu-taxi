import { GrammyError } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, type BackendApi } from './api.js';
import { createBot } from './bot.js';
import { deliverOnce } from './notifier.js';
import { normalizeUzPhone } from './phone.js';
import { notificationText } from './texts.js';

const TOKEN = '123456:TEST-TOKEN-abcdefghijklmnopqrstuvwxyz';
const botInfo = {
  id: 1, is_bot: true as const, first_name: 'Abu Tax', username: 'AbuTaxBot', can_join_groups: false,
  can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
} as unknown as UserFromGetMe;
const ME = { id: 777, is_bot: false, first_name: 'Ali', last_name: 'Valiyev', username: 'ali_uz', language_code: 'uz' };

let updateId = 0;
const msg = (extra: Record<string, unknown>, chatType: 'private' | 'group' = 'private', from = ME): Update => ({
  update_id: ++updateId,
  message: { message_id: updateId, date: 0, chat: chatType === 'private' ? { id: from.id, type: 'private', first_name: from.first_name } : { id: -100, type: 'group', title: 'g' }, from, ...extra },
} as unknown as Update);
const text = (t: string, chatType?: 'private' | 'group') =>
  msg({ text: t, ...(t.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: t.split(' ')[0]!.length }] } : {}) }, chatType);

function setup(api: Partial<BackendApi>, webUrl = 'http://localhost:5173') {
  const full: BackendApi = {
    requestLoginCode: vi.fn(),
    pendingNotifications: vi.fn(async () => []),
    ackNotifications: vi.fn(async () => {}),
    rideCheck: vi.fn(),
    rideTake: vi.fn(),
    rideGroupQueue: vi.fn(async () => ({ toPost: [], toClose: [] })),
    rideGroupPosted: vi.fn(async () => {}),
    rideGroupClosed: vi.fn(async () => {}),
    ...api,
  } as BackendApi;
  const bot = createBot(TOKEN, { api: full, webUrl, log: () => {} }, botInfo);
  const sent: { method: string; payload: Record<string, any> }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload: payload as Record<string, any> });
    return { ok: true, result: true } as any;
  });
  const messages = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.payload);
  return { bot, api: full, sent, messages };
}

const code = { code: 'K7M4QX', expiresIn: 60, isNew: false, lang: 'UZ' as const };

describe('telefon', () => {
  it("O'zbekiston raqamlari normallashtiriladi, boshqalari rad etiladi", () => {
    expect(normalizeUzPhone('998901234567')).toBe('+998901234567');
    expect(normalizeUzPhone('+998 90 123-45-67')).toBe('+998901234567');
    expect(normalizeUzPhone('79001234567')).toBeNull();
    expect(normalizeUzPhone('99890123')).toBeNull();
  });
});

describe('bot: kirish kodi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it("/start — ma'lum foydalanuvchiga darhol kod (HTML, nusxalanadigan)", async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => code) });
    await s.bot.handleUpdate(text('/start'));
    expect(s.api.requestLoginCode).toHaveBeenCalledWith({
      telegramId: '777', firstName: 'Ali', lastName: 'Valiyev', username: 'ali_uz', languageCode: 'uz',
    });
    const [m] = s.messages();
    expect(m!.text).toContain('<code>K7M4QX</code>');
    expect(m!.parse_mode).toBe('HTML');
    const buttons = m!.reply_markup.inline_keyboard.flat();
    expect(buttons.map((b: any) => b.callback_data ?? b.url)).toEqual(['new_code']); // localhost — sayt tugmasi yo'q
  });

  it("https sayt bo'lsa \"Saytga o'tish\" tugmasi qo'shiladi", async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => code) }, 'https://abutax.uz');
    await s.bot.handleUpdate(text('/start'));
    const urls = s.messages()[0]!.reply_markup.inline_keyboard.flat().map((b: any) => b.url).filter(Boolean);
    expect(urls).toEqual(['https://abutax.uz/login']);
  });

  it("raqam hali yo'q — kontakt so'raladi (request_contact tugmasi)", async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => { throw new ApiError(409, 'PHONE_REQUIRED'); }) });
    await s.bot.handleUpdate(text('/start'));
    const [m] = s.messages();
    expect(m!.text).toContain('telefon raqamingizni yuboring');
    expect(m!.reply_markup.keyboard[0][0]).toMatchObject({ request_contact: true });
  });

  it("o'z kontakti → kod; telefon backend'ga +998 formatida", async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => code) });
    await s.bot.handleUpdate(msg({ contact: { phone_number: '998901234567', first_name: 'Ali', user_id: 777 } }));
    expect(s.api.requestLoginCode).toHaveBeenCalledWith(expect.objectContaining({ telegramId: '777', phone: '+998901234567' }));
    expect(s.messages().at(-1)!.text).toContain('K7M4QX');
  });

  it("BOSHQA odamning kontakti rad etiladi (begona raqamga hisob ochib bo'lmaydi)", async () => {
    const s = setup({ requestLoginCode: vi.fn() });
    await s.bot.handleUpdate(msg({ contact: { phone_number: '998901234567', first_name: 'Boshqa', user_id: 999 } }));
    await s.bot.handleUpdate(msg({ contact: { phone_number: '998901234567', first_name: 'Ism' } })); // user_id yo'q
    expect(s.api.requestLoginCode).not.toHaveBeenCalled();
    expect(s.messages().every((m) => m.text.includes("o'zingizning"))).toBe(true);
  });

  it("chet el raqami rad etiladi", async () => {
    const s = setup({ requestLoginCode: vi.fn() });
    await s.bot.handleUpdate(msg({ contact: { phone_number: '79001234567', first_name: 'Ali', user_id: 777 } }));
    expect(s.api.requestLoginCode).not.toHaveBeenCalled();
    expect(s.messages()[0]!.text).toContain('+998');
  });

  it.each([
    ['PHONE_TAKEN', 409, 'boshqa Telegram'],
    ['USER_BLOCKED', 403, 'bloklangan'],
    ['LOGIN_CODE_LIMIT', 429, "ko'p so'raldi"],
    ['INTERNAL', 500, 'Xatolik'],
  ])('backend xatosi %s → tushunarli xabar', async (codeName, status, fragment) => {
    const s = setup({ requestLoginCode: vi.fn(async () => { throw new ApiError(status, codeName, 120); }) });
    await s.bot.handleUpdate(text('/code'));
    expect(s.messages()[0]!.text).toContain(fragment);
  });

  it('"🔑 Kod olish" tugmasi va "Yangi kod" callback ishlaydi', async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => code) });
    await s.bot.handleUpdate(text('🔑 Kod olish'));
    await s.bot.handleUpdate({
      update_id: ++updateId,
      callback_query: { id: 'cb', from: ME, chat_instance: 'x', data: 'new_code', message: { message_id: 1, date: 0, chat: { id: 777, type: 'private', first_name: 'Ali' } } },
    } as unknown as Update);
    expect(s.api.requestLoginCode).toHaveBeenCalledTimes(2);
    expect(s.sent.some((x) => x.method === 'answerCallbackQuery')).toBe(true);
  });

  it("guruhda kod berilmaydi", async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => code) });
    await s.bot.handleUpdate(text('/start', 'group'));
    expect(s.api.requestLoginCode).not.toHaveBeenCalled();
    expect(s.messages()).toHaveLength(0);
  });

  it('ruscha til', async () => {
    const s = setup({ requestLoginCode: vi.fn(async () => ({ ...code, lang: 'RU' as const })) });
    await s.bot.handleUpdate(text('/start'));
    expect(s.messages()[0]!.text).toContain('Ваш код');
  });
});

describe('bildirishnomalar navbati', () => {
  it("yuboradi; o'tkazib yuboriladigan va qayta urinish befoyda bo'lganlarni belgilaydi; vaqtinchalik xatoni qoldiradi", async () => {
    const api = {
      requestLoginCode: vi.fn(),
      pendingNotifications: vi.fn(async () => [
        { id: 'n1', telegramId: '1', lang: 'UZ' as const, type: 'booking:updated', payload: { status: 'CONFIRMED' } },
        { id: 'n2', telegramId: '2', lang: 'UZ' as const, type: 'trip:updated', payload: { status: 'IN_PROGRESS' } }, // matn yo'q
        { id: 'n3', telegramId: '3', lang: 'RU' as const, type: 'booking:new', payload: { seats: 2 } }, // bot bloklangan
        { id: 'n4', telegramId: '4', lang: 'UZ' as const, type: 'booking:new', payload: { seats: 1 } }, // tarmoq xatosi
      ]),
      ackNotifications: vi.fn(async () => {}),
    };
    const sendMessage = vi.fn(async (chatId: string | number) => {
      if (chatId === '3') throw new GrammyError('blocked', { ok: false, error_code: 403, description: 'Forbidden' }, 'sendMessage', {});
      if (chatId === '4') throw new Error('ETIMEDOUT');
      return {} as never;
    });
    const n = await deliverOnce(api as unknown as BackendApi, { sendMessage } as never, () => {});
    expect(n).toBe(3);
    expect(api.ackNotifications).toHaveBeenCalledWith(['n1', 'n2', 'n3']);
    expect(sendMessage).toHaveBeenCalledWith('1', '✅ Band qilishingiz tasdiqlandi. Haydovchi raqami saytda.', { parse_mode: 'HTML' });
  });

  it('admin kiritgan sabab HTML-escape qilinadi', () => {
    expect(notificationText('driver:status', { status: 'REJECTED', reason: '<b>x</b>' }, 'UZ')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('backend API mijozi', () => {
  it('X-Bot-Secret yuboradi va xato kodini ApiError ga aylantiradi', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, error: { code: 'LOGIN_CODE_LIMIT' } }), { status: 429, headers: { 'Retry-After': '90' } }),
    );
    const api = createApi('http://api/api/v1/', 's'.repeat(40), fetchMock as unknown as typeof fetch);
    const err = await api.requestLoginCode({ telegramId: '1' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'LOGIN_CODE_LIMIT', retryAfter: 90 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/v1/internal/bot/login-code');
    expect((init.headers as Record<string, string>)['X-Bot-Secret']).toBe('s'.repeat(40));
  });
});

describe("safar so'rovlari", () => {
  const ride = {
    requestId: 'ckride000000000000000001',
    from: { uz: 'Asaka', ru: 'Асака' },
    to: { uz: 'Toshkent', ru: 'Ташкент' },
    date: '2026-10-20T19:00:00.000Z', // Toshkent: 21-oktabr
    seats: 2,
    offeredPrice: 150_000,
    note: '<b>ertalab</b>',
  };
  const taken = { ...ride, passengerName: 'Dilnoza Karimova', phone: '+998901234567', telegramUsername: 'dilnoza', pricePerSeat: 140_000 };
  const callback = (data: string): Update => ({
    update_id: ++updateId,
    callback_query: { id: String(updateId), from: ME, chat_instance: '1', data, message: { message_id: 1, date: 0, chat: { id: ME.id, type: 'private', first_name: 'Ali' } } },
  } as unknown as Update);

  it('narx tahlili: "150 000", "150" (ming), "so\'m" bilan; chegaradan tashqarisi rad', async () => {
    const { parsePrice } = await import('./texts.js');
    expect(parsePrice('150 000')).toBe(150_000);
    expect(parsePrice('150')).toBe(150_000);
    expect(parsePrice("120.000 so'm")).toBe(120_000);
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('9000000')).toBeNull();
  });

  it('guruhdan deep-link (/start rr_<id>) → narx so\'raladi → narx yozildi → yo\'lovchi kontakti', async () => {
    const s = setup({ rideCheck: vi.fn(async () => ride), rideTake: vi.fn(async () => taken) });
    await s.bot.handleUpdate(text(`/start rr_${ride.requestId}`));
    expect(s.api.rideCheck).toHaveBeenCalledWith(ride.requestId, '777');
    const ask = s.messages()[0]!;
    expect(ask.text).toContain('Asaka → Toshkent');
    expect(ask.text).toContain('21-oktabr, chorshanba');
    expect(ask.text).toContain('&lt;b&gt;ertalab'); // yo'lovchi izohi escape qilinadi
    expect(ask.reply_markup.inline_keyboard[0][0].callback_data).toBe(`rp:${ride.requestId}:150000`);

    await s.bot.handleUpdate(text('salom'));
    expect(s.messages().at(-1)!.text).toContain('Narxni raqam bilan yozing');
    await s.bot.handleUpdate(text('140'));
    expect(s.api.rideTake).toHaveBeenCalledWith(ride.requestId, '777', 140_000);
    const done = s.messages().at(-1)!.text;
    expect(done).toContain("So'rov sizga biriktirildi");
    expect(done).toContain('+998 90 123 45 67');
    expect(done).toContain('@dilnoza');

    // Narx kutish tugadi — oddiy matn endi so'rov sifatida olinmaydi
    await s.bot.handleUpdate(text('150'));
    expect(s.api.rideTake).toHaveBeenCalledTimes(1);
  });

  it('taklif narxi tugmasi bitta bosishda oladi; band bo\'lsa — tushunarli xabar', async () => {
    const s = setup({ rideTake: vi.fn(async () => { throw new ApiError(409, 'RIDE_REQUEST_NOT_OPEN'); }) });
    await s.bot.handleUpdate(callback(`rp:${ride.requestId}:150000`));
    expect(s.api.rideTake).toHaveBeenCalledWith(ride.requestId, '777', 150_000);
    expect(s.messages().at(-1)!.text).toContain('boshqa haydovchi olib bo');
  });

  it('haydovchi emas — ro\'yxatdan o\'tish haqida xabar', async () => {
    const s = setup({ rideCheck: vi.fn(async () => { throw new ApiError(403, 'DRIVER_PROFILE_REQUIRED'); }) });
    await s.bot.handleUpdate(callback(`rr:${ride.requestId}`));
    expect(s.messages()[0]!.text).toContain('haydovchi</b> sifatida');
  });

  it("guruh: yangi so'rov tashlanadi (deep-link tugma, telefonsiz), olingani yopiladi", async () => {
    const { syncGroupOnce } = await import('./rideRequests.js');
    const api = {
      rideGroupQueue: vi.fn(async () => ({ toPost: [ride], toClose: [{ requestId: 'r2', status: 'ASSIGNED', chatId: '-100500', messageId: 9 }] })),
      rideGroupPosted: vi.fn(async () => {}),
      rideGroupClosed: vi.fn(async () => {}),
    } as unknown as BackendApi;
    const sendMessage = vi.fn(async () => ({ message_id: 42 }));
    const editMessageReplyMarkup = vi.fn(async () => true);
    const res = await syncGroupOnce(api, { sendMessage, editMessageReplyMarkup } as never, '-100500', 'AbuTaxBot', () => {});
    expect(res).toEqual({ posted: 1, closed: 1 });
    const [chatId, postText, opts] = sendMessage.mock.calls[0] as unknown as [string, string, any];
    expect(chatId).toBe('-100500');
    expect(postText).toContain('Asaka → Toshkent');
    expect(postText).not.toContain('+998');
    expect(opts.reply_markup.inline_keyboard[0][0].url).toBe(`https://t.me/AbuTaxBot?start=rr_${ride.requestId}`);
    expect(api.rideGroupPosted).toHaveBeenCalledWith(ride.requestId, '-100500', 42);
    expect(editMessageReplyMarkup).toHaveBeenCalledWith('-100500', 9, expect.anything());
    expect(api.rideGroupClosed).toHaveBeenCalledWith('r2');
  });

  it("yo'nalishdagi haydovchiga bildirishnoma \"Olaman\" tugmasi bilan; yo'lovchiga haydovchi ma'lumoti", async () => {
    const { notificationMarkup } = await import('./notifier.js');
    const kb = notificationMarkup('ride:request:new', ride, 'UZ')!;
    expect(kb.inline_keyboard[0]![0]).toMatchObject({ text: '🙋 Olaman', callback_data: `rr:${ride.requestId}` });
    const msgText = notificationText(
      'ride:request:assigned',
      { ...ride, driverName: 'Sardor Aliyev', carModel: 'Chevrolet Cobalt', carColor: 'Oq', carPlate: '01 A 777 AA', phone: '+998901110000', pricePerSeat: 150_000 },
      'UZ',
    )!;
    expect(msgText).toContain('Sizni <b>Sardor Aliyev</b> olib ketadi');
    expect(msgText).toContain('Chevrolet Cobalt, Oq');
    expect(msgText).toContain("150 000 so'm");
    expect(msgText).toContain('+998 90 111 00 00');
  });
});
