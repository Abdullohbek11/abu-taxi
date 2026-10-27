import { createApi } from './api.js';
import { createBot } from './bot.js';
import { loadConfig } from './config.js';
import { startNotifier } from './notifier.js';
import { startGroupSync } from './rideRequests.js';

const config = loadConfig();
const api = createApi(config.API_URL, config.BOT_API_SECRET);
const bot = createBot(config.BOT_TOKEN, { api, webUrl: config.WEB_URL });

await bot.api.setMyCommands([
  { command: 'start', description: 'Kirish kodi olish / Получить код' },
  { command: 'code', description: 'Yangi kod / Новый код' },
  { command: 'help', description: 'Yordam / Помощь' },
]);
await bot.api.setMyCommands([{ command: 'chatid', description: 'Guruh ID (sozlash uchun)' }], { scope: { type: 'all_group_chats' } });

const stopNotifier = config.TELEGRAM_NOTIFY ? startNotifier(api, bot.api, config.NOTIFY_INTERVAL_MS) : () => {};

// Safar so'rovlari: haydovchilar olmasa — Telegram guruhga
await bot.init();
const stopGroupSync = config.GROUP_CHAT_ID
  ? startGroupSync(api, bot.api, config.GROUP_CHAT_ID, bot.botInfo.username, config.GROUP_POLL_MS)
  : (console.log("GROUP_CHAT_ID yo'q — so'rovlar guruhga tashlanmaydi (botni guruhga qo'shib, /chatid yozing)"), () => {});

// Long polling — webhook/SSL sozlash shart emas
void bot.start({
  drop_pending_updates: true,
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  onStart: (me) =>
    console.log(
      `Bot ishga tushdi: @${me.username} (bildirishnomalar: ${config.TELEGRAM_NOTIFY ? 'yoqilgan' : "o'chiq"}, guruh: ${config.GROUP_CHAT_ID ?? "yo'q"})`,
    ),
});

async function shutdown(signal: string) {
  console.log(`${signal} — bot to'xtatilmoqda`);
  stopNotifier();
  stopGroupSync();
  await bot.stop();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
