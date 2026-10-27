# Abu Tax — loyiha qoidalari

Butun O'zbekiston bo'ylab shaharlararo taksi va yuk tashish platformasi. Yo'lovchi/yuk jo'natuvchi haydovchi bilan vositachisiz bog'lanadi.

## Tuzilma
- `frontend/Abu Tax Landing.dc.html` — Claude Design'dagi asl dizayn (namuna). **O'zgartirilmaydi.**
- `frontend/app/` — sayt (Vite + React + TS, TanStack Query): dizayn tokenlari asl dizayndan, UZ/RU (`src/locales`, RU barcha kalitlarni talab qiladi). API'ga same-origin (`/api` proxy).
- `backend/` — mustaqil REST API (veb, mobil ilova).
- `bot/` — Telegram bot (grammY): kirish kodlari (OTP) va bildirishnomalar. Telegram bilan bog'liq hamma narsa shu yerda; backend bilan faqat ichki API (`/api/v1/internal/bot`, `X-Bot-Secret`) orqali gaplashadi.

## Ish tartibi
- Backend 9 bosqichda quriladi. Har bosqichda kodni o'zing tekshir (typecheck + test yoki curl).
- Tekshiruv o'tsa — tasdiq kutmasdan keyingi bosqichga o't. Faqat hal qilib bo'lmaydigan muammo yoki foydalanuvchi qarori kerak bo'lsa to'xta.
- Foydalanuvchi bilan faqat o'zbek tilida muloqot.

## Stack
Node.js 20 + TypeScript (strict), Express + zod, MySQL 8 + Prisma (yagona ma'lumotlar bazasi: OTP, rate limit va cron qulflari ham MySQL jadvallarida; Redis va PostgreSQL ishlatilmaydi), Socket.IO, S3 (lokal MinIO), JWT (access 15 daq + refresh 30 kun, rotatsiya), node-cron, Vitest + Supertest, Swagger `/docs`, Docker + docker-compose, pino.

## Kod qoidalari
- Modul tuzilmasi: `src/modules/<nom>/{*.routes,*.controller,*.service,*.schema,*.test}.ts`.
- `src/lib/` (prisma, s3, sms, telegram, jwt, errors, i18n), `src/middlewares/`, `src/sockets/`, `src/jobs/`, `src/config/` (env zod bilan).
- Barcha narxlar `Int` (so'm). Har jadvalda `id` (cuid), `createdAt`, `updatedAt`.
- Sanalar bazada UTC, API'da ISO 8601.
- Javob: `{ success: true, data, meta? }` / xato: `{ success: false, error: { code, message, fields? } }`.
- Xato kodlari faqat `src/lib/errors.ts` da; xabarlar `Accept-Language` (uz | ru) bo'yicha.
- Barcha kirishlar zod bilan tekshiriladi; holat o'zgarishlari state machine orqali (noto'g'ri o'tish → 409).
- Logda maxfiy ma'lumot yo'q, telefon maskalanadi (`+99890***4567`); production'da stack trace qaytarilmaydi.

## Asosiy biznes qoidalari
- O'rin band qilish tranzaksiyada atomik (`availableSeats >= seats`); bekor/rad qilinganda o'rin qaytadi.
- Telefonlar faqat booking CONFIRMED / cargo offer ACCEPTED bo'lgach ochiladi.
- Faqat APPROVED haydovchi safar e'lon qiladi va yukka taklif beradi. Bloklangan foydalanuvchi hech narsa yaratmaydi.
- Sharh faqat COMPLETED safar / DELIVERED yukdan keyin 14 kun ichida, bitta muallif — bitta sharh.
- Kirish faqat Telegram bot orqali (parolsiz, SMS yo'q): botga kontakt (o'z raqami) → 6 belgili, 60 soniyalik kod → `POST /auth/code`. Telefon va `telegramUsername` faqat bot orqali o'zgaradi.
- Yagona istisno — ADMIN: `/admin/login` sahifasida telefon + parol (`POST /auth/admin/login`, scrypt, 5 xato → 30 daqiqa qulf, har kirish jurnalga va Telegram'ga). Parol faqat CLI (`npm run admin -- password <tel>`) yoki admin paneldagi "Xavfsizlik" bo'limi orqali o'rnatiladi. Oddiy foydalanuvchilarga parol qo'shilmaydi.
