/**
 * Bot profilini brendga moslash: rasm (logo), nom, tavsiflar va menyu tugmasi (saytni ochadi).
 * Bir marta ishga tushiriladi (Telegram nom/rasm o'zgartirishni cheklaydi):
 *   npm run brand            # lokal (tsx)
 *   node dist/brand.js       # serverda, bot papkasidan
 */
import { readFileSync } from 'node:fs';
import { Bot, InputFile } from 'grammy';
import { loadConfig } from './config.js';

const config = loadConfig();
const bot = new Bot(config.BOT_TOKEN);
const avatar = new URL('../assets/avatar.jpg', import.meta.url);

const texts = {
  uz: {
    name: 'Abu Tax',
    short: "Shaharlararo taksi va yuk tashish — haydovchi bilan vositachisiz. Saytga kirish kodi shu botda.",
    description:
      "🚕 Abu Tax — O'zbekiston bo'ylab shaharlararo taksi va yuk tashish.\n\n" +
      "• Safar toping va o'rin band qiling\n• Haydovchi topilmasa — so'rov qoldiring\n• Yuk jo'nating, tashuvchilar narx taklif qiladi\n\n" +
      "Kirish uchun /start bosing va raqamingizni yuboring — bot 6 belgili kod beradi.",
    menu: 'Saytni ochish',
  },
  ru: {
    name: 'Abu Tax',
    short: 'Междугороднее такси и грузоперевозки — напрямую с водителем. Код для входа на сайт — в этом боте.',
    description:
      '🚕 Abu Tax — междугороднее такси и грузоперевозки по всему Узбекистану.\n\n' +
      '• Найдите поездку и забронируйте место\n• Нет подходящей — оставьте заявку\n• Отправьте груз, перевозчики предложат цену\n\n' +
      'Нажмите /start и отправьте свой номер — бот пришлёт 6-значный код.',
    menu: 'Открыть сайт',
  },
};

await bot.api.setMyProfilePhoto({ type: 'static', photo: new InputFile(readFileSync(avatar), 'avatar.jpg') });
// O'zbek — standart (tilsiz), rus — Telegram tili ru bo'lganlarga
for (const [language_code, t] of [[undefined, texts.uz], ['ru', texts.ru]] as const) {
  await bot.api.setMyName(t.name, { language_code });
  await bot.api.setMyShortDescription(t.short, { language_code });
  await bot.api.setMyDescription(t.description, { language_code });
}
// Mini App faqat https manzil bilan ishlaydi (lokal http://localhost bo'lsa tugma o'zgartirilmaydi)
if (config.WEB_URL.startsWith('https://')) {
  await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: texts.uz.menu, web_app: { url: config.WEB_URL } } });
} else console.log(`WEB_URL https emas (${config.WEB_URL}) — menyu tugmasi o'zgartirilmadi`);
console.log('Bot profili yangilandi');
