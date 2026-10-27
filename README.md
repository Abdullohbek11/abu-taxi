# Abu Tax

Butun O'zbekiston bo'ylab **shaharlararo taksi va yuk tashish** platformasi. Yo'lovchi va yuk jo'natuvchi haydovchi bilan vositachisiz bog'lanadi.

🌐 **Sayt:** https://abutax.duckdns.org · 🤖 **Bot:** [@taxizakRObot](https://t.me/taxizakRObot)

## Imkoniyatlar

- **Yo'lovchi:** safar qidirish, o'rin tanlab band qilish, uydan olib ketish manzili; safar topilmasa — so'rov qoldirish (haydovchilarga bot orqali, keyin Telegram guruhga).
- **Haydovchi:** safar e'lon qilish, so'rovlarni qabul qilish, yuklarga narx taklif qilish, 30 kunlik tarif (karta/chek, Payme, Click).
- **Yuk:** jo'natuvchi yuk e'lon qiladi, tashuvchilar narx taklif qiladi.
- **Xavfsizlik:** telefon raqamlar faqat tasdiqlangandan keyin ochiladi; ikki tomonlama reyting; bloklash.
- **Kirish:** parolsiz, Telegram bot orqali bir martalik kod (admin — alohida parolli sahifa `/admin/login`).
- **Admin panel:** statistika, mijozlar bazasi, haydovchilarni tasdiqlash, to'lovlar, CSV eksport.
- UZ / RU, mobil dizayn, PWA (telefonga o'rnatiladi).

## Tuzilma

| Papka | Tavsif |
|---|---|
| [`backend/`](backend) | REST API — Node.js 20, TypeScript, Express 5, zod, Prisma + MySQL 8, Socket.IO, Vitest. Batafsil: [backend/README.md](backend/README.md) |
| [`frontend/app/`](frontend/app) | Sayt — Vite + React 19 + TypeScript, TanStack Query |
| [`bot/`](bot) | Telegram bot (grammY): kirish kodlari va bildirishnomalar |

## Lokal ishga tushirish

```bash
cd backend && cp .env.example .env && npm install
npx prisma migrate deploy && npm run seed && npm run seed:demo
npm run dev                                   # API → http://localhost:4000 (Swagger: /docs)

cd ../bot && cp .env.example .env && npm install && npm run dev
cd ../frontend/app && npm install && npm run dev   # sayt → http://localhost:5173
```

Testlar: `cd backend && npm test`, `cd bot && npm test`. Production deploy — [backend/README.md](backend/README.md#joriy-production).
