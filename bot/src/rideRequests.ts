import { GrammyError, InlineKeyboard, type Api } from 'grammy';
import type { BackendApi } from './api.js';
import { groupClosedLabel, groupPostText } from './texts.js';

/** Guruhdagi "Olaman" tugmasi botning shaxsiy chatini ochadi (deep-link): narx va kontakt faqat shaxsiyda. */
export const takeDeepLink = (botUsername: string, requestId: string) => `https://t.me/${botUsername}?start=rr_${requestId}`;

/**
 * Guruh navbati: haydovchilar belgilangan vaqtda olmagan so'rovlarni guruhga tashlaydi va
 * olingan/bekor qilingan so'rovlar postidagi tugmani "✅ Haydovchi topildi" ga almashtiradi.
 */
export async function syncGroupOnce(
  api: BackendApi,
  telegram: Pick<Api, 'sendMessage' | 'editMessageReplyMarkup'>,
  chatId: string,
  botUsername: string,
  log = console.error,
): Promise<{ posted: number; closed: number }> {
  const queue = await api.rideGroupQueue();
  let posted = 0;
  let closed = 0;
  for (const r of queue.toPost) {
    try {
      const msg = await telegram.sendMessage(chatId, groupPostText(r), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url('🙋 Olaman', takeDeepLink(botUsername, r.requestId)),
        link_preview_options: { is_disabled: true },
      });
      await api.rideGroupPosted(r.requestId, String(chatId), msg.message_id);
      posted++;
    } catch (err) {
      log("So'rov guruhga tashlanmadi, keyinroq qayta uriniladi", err);
    }
  }
  for (const c of queue.toClose) {
    try {
      await telegram.editMessageReplyMarkup(c.chatId, c.messageId, {
        reply_markup: new InlineKeyboard().text(groupClosedLabel(c.status), 'noop'),
      });
    } catch (err) {
      // Post o'chirilgan yoki allaqachon o'zgartirilgan — qayta urinish befoyda
      const permanent = err instanceof GrammyError && err.error_code === 400;
      if (!permanent) {
        log('Guruhdagi post yangilanmadi', err);
        continue;
      }
    }
    await api.rideGroupClosed(c.requestId);
    closed++;
  }
  return { posted, closed };
}

export function startGroupSync(
  api: BackendApi,
  telegram: Pick<Api, 'sendMessage' | 'editMessageReplyMarkup'>,
  chatId: string,
  botUsername: string,
  intervalMs: number,
  log = console.error,
) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    try {
      await syncGroupOnce(api, telegram, chatId, botUsername, log);
    } catch (err) {
      log("Guruh navbatini olishda xato", err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, 1000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
