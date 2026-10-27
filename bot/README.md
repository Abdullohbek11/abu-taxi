# Abu Tax — Telegram bot

Telegram bilan bog'liq hamma narsa shu papkada:

- **Kirish kodi (OTP)** — saytga parolsiz kirish va ro'yxatdan o'tish (42.uz uslubi).
- **Bildirishnomalar** — yangi band qilish, tasdiq, taklif qabul qilinishi va boshqa hodisalar.

Bot ma'lumotlar bazasiga ulanmaydi. U backend bilan faqat ichki API orqali gaplashadi (`/api/v1/internal/bot`, `X-Bot-Secret` sarlavhasi bilan).

## Foydalanuvchi uchun oqim

1. Saytda "@AbuTaxBot ga kiring va kodni oling" yozuvi va 6 ta katak ko'rinadi.
2. Botda `/start` bosiladi. Raqam hali yuborilmagan bo'lsa, **📱 Raqamni yuborish** tugmasi chiqadi (Telegram kontakti).
3. Bot faqat **o'z** raqamini qabul qiladi (`contact.user_id === from.id`) va faqat `+998` raqamlarini.
4. Bot `K7M4QX` ko'rinishidagi kodni yuboradi. Kod 60 soniya amal qiladi, bir martalik. Tugmalar: **🔄 Yangi kod** va **🌐 Saytga o'tish** (ikkinchisi faqat https domen bo'lsa ko'rinadi).
5. Kod saytga kiritiladi (`POST /api/v1/auth/code`). Yangi foydalanuvchi uchun hisob shu jarayonda yaratiladi. Raqam mavjud hisobga tegishli bo'lsa, Telegram o'sha hisobga bog'lanadi.

Parol ishlatilmaydi, shuning uchun parolni tiklash ham kerak emas: har safar kirish botdan olingan kod bilan bo'ladi.

## Bildirishnomalar (outbox)

Backend hodisani `Notification` jadvaliga yozadi. Bot har `NOTIFY_INTERVAL_MS` da yuborilmaganlarini oladi, ularni Telegram'ga jo'natadi va "yuborildi" deb belgilaydi.

- Bot o'chiq bo'lsa ham xabarlar yo'qolmaydi, lekin 1 soatdan eskilari yuborilmaydi.
- Foydalanuvchi botni bloklagan bo'lsa (403), qayta urinilmaydi. Vaqtinchalik xatolarda keyingi aylanishda qayta urinadi.

## Safar so'rovlari (safar topilmaganda)

1. Yo'lovchi saytda safar topmasa, so'rov qoldiradi: qayerdan, qayerga, sana, necha kishi, taklif narxi va izoh.
2. Backend so'rovni shu yo'nalishda oxirgi 90 kunda safar qilgan haydovchilarga bildirishnoma qilib yozadi. Bot ularga **🙋 Olaman** tugmasi bilan shaxsiy xabar yuboradi.
3. `RIDE_REQUEST_GROUP_DELAY_MIN` (standart 10) daqiqa ichida hech kim olmasa, bot so'rovni **guruhga** tashlaydi. Mos haydovchi umuman bo'lmasa, darhol tashlaydi. Postda yo'lovchining telefoni bo'lmaydi.
4. Guruhdagi "Olaman" tugmasi botning shaxsiy chatini ochadi (`t.me/<bot>?start=rr_<id>`). Bot haydovchini tekshiradi: u tasdiqlangan bo'lishi va tasdiqlangan mashinasi bo'lishi kerak. Keyin narxni so'raydi: `150000` yoki qisqa `150` deb yozish mumkin, taklif narxi bo'lsa uni bitta tugma bilan tanlasa bo'ladi.
5. Birinchi narx yozgan haydovchi so'rovni oladi. Yo'lovchiga *"Sizni falonchi olib ketadi"* degan xabar boradi: mashina, raqami, narxi va telefoni bilan. Haydovchi yo'lovchining raqamini oladi. Guruhdagi post tugmasi **✅ Haydovchi topildi** ga almashadi.
6. Tizimda yo'q haydovchini admin saytdagi **Admin → So'rovlar** bo'limida qo'lda biriktira oladi.

**Guruhni ulash:** botni guruhga qo'shing (yoki kanalga admin qiling) va guruhda `/chatid` deb yozing. Chiqqan raqamni `bot/.env` dagi `GROUP_CHAT_ID` ga yozing va botni qayta ishga tushiring.

## Ishga tushirish

```bash
cp .env.example .env    # BOT_TOKEN (@BotFather), BOT_API_SECRET (backend/.env dagi bilan bir xil)
npm install
npm run dev             # long polling — webhook/SSL shart emas
npm test                # 23 ta test (tarmoqsiz: Telegram API grammY transformer bilan ushlanadi)
```

Production'da bot `backend/docker-compose.yml` dagi `bot` servisi sifatida ishga tushadi. U tashqariga port ochmaydi.

## Tuzilma

| Fayl | Vazifa |
|---|---|
| `src/bot.ts` | `/start`, `/code`, `/help`, kontakt, "Yangi kod" tugmasi (faqat shaxsiy chat) |
| `src/api.ts` | Backend ichki API mijozi (`ApiError`: `PHONE_REQUIRED`, `PHONE_TAKEN`, `USER_BLOCKED`, `LOGIN_CODE_LIMIT`) |
| `src/notifier.ts` | Bildirishnomalar navbatini yuborish |
| `src/texts.ts` | UZ/RU matnlar va bildirishnoma shablonlari (HTML-escape bilan) |
| `src/phone.ts` | Raqamni `+998XXXXXXXXX` ko'rinishiga keltirish |
| `src/config.ts` | Muhit o'zgaruvchilarini zod bilan tekshirish |
