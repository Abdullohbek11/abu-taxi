import { GrammyError, InlineKeyboard, type Api } from 'grammy';
import type { BackendApi, Lang } from './api.js';
import { notificationText, t } from './texts.js';

/** Ba'zi bildirishnomalarga tugma qo'shiladi: yangi so'rov → "🙋 Olaman". */
export function notificationMarkup(type: string, payload: Record<string, unknown>, lang: Lang): InlineKeyboard | undefined {
  if (type === 'ride:request:new' && typeof payload.requestId === 'string') {
    return new InlineKeyboard().text(t(lang).take, `rr:${payload.requestId}`);
  }
  return undefined;
}

/**
 * Bildirishnomalar navbati (outbox): backend hodisani bazaga yozadi, bot har N soniyada
 * yuborilmaganlarini oladi, Telegram'ga jo'natadi va "yuborildi" deb belgilaydi.
 * Backend Telegram tokenini bilmaydi; bot o'chiq bo'lsa ham hodisalar yo'qolmaydi.
 */
export async function deliverOnce(api: BackendApi, telegram: Pick<Api, 'sendMessage'>, log = console.error): Promise<number> {
  const items = await api.pendingNotifications(50);
  const done: string[] = [];
  for (const n of items) {
    const text = notificationText(n.type, n.payload, n.lang);
    if (text) {
      try {
        const reply_markup = notificationMarkup(n.type, n.payload, n.lang);
        await telegram.sendMessage(n.telegramId, text, { parse_mode: 'HTML', ...(reply_markup ? { reply_markup } : {}) });
      } catch (err) {
        // 403 — foydalanuvchi botni bloklagan; 400 — chat topilmadi: qayta urinish befoyda
        const permanent = err instanceof GrammyError && (err.error_code === 403 || err.error_code === 400);
        if (!permanent) {
          log('Bildirishnoma yuborilmadi, keyinroq qayta uriniladi', err);
          continue;
        }
      }
    }
    done.push(n.id);
  }
  await api.ackNotifications(done);
  return done.length;
}

export function startNotifier(api: BackendApi, telegram: Pick<Api, 'sendMessage'>, intervalMs: number, log = console.error) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    try {
      await deliverOnce(api, telegram, log);
    } catch (err) {
      log('Bildirishnomalar navbatini olishda xato', err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
