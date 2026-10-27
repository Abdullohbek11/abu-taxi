# Abu Tax — Backend API

Butun O'zbekiston bo'ylab shaharlararo taksi va yuk tashish platformasi. Yo'lovchi va yuk jo'natuvchi haydovchi bilan **vositachisiz** bog'lanadi. API mustaqil: veb-frontend, mobil ilova va Telegram bot bir xil API'dan foydalanadi.

**Stack:** Node.js 20 · TypeScript (strict) · Express 5 · zod · MySQL 8 + Prisma · Socket.IO · S3 (MinIO) · JWT · node-cron · Vitest + Supertest · Swagger · Docker · pino

---

## Tezkor ishga tushirish (lokal)

Talablar: Node.js 20+, MySQL 8 (Docker yoki lokal), MinIO (rasmlar uchun).

Yagona ma'lumotlar bazasi — **MySQL**. Redis yoki PostgreSQL kerak emas: kirish kodlari (`LoginCode`), rate limit hisoblagichlari (`RateLimit`) va cron qulflari (`JobLock`) ham MySQL jadvallarida saqlanadi.

```bash
cd backend
cp .env.example .env                 # kerak bo'lsa qiymatlarni o'zgartiring
docker compose up -d mysql minio minio-init
npm install
npx prisma migrate deploy            # jadvallarni yaratish
npm run seed                         # namunaviy ma'lumotlar
npm run dev                          # http://localhost:4000

# Telegram bot (kirish kodlari) — alohida terminalda
cd ../bot && cp .env.example .env    # BOT_TOKEN va BOT_API_SECRET ni to'ldiring
npm install && npm run dev

# Sayt — alohida terminalda (http://localhost:5173)
cd ../frontend/app && npm install && npm run dev
```

Sayt `http://localhost:5173` da ochiladi. Vite `/api`, `/socket.io` va `/uploads` so'rovlarini backend'ga (4000-port) yo'naltiradi, shuning uchun sayt va API bitta manzildan ishlaydi.

- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/docs` (JSON: `/docs.json`)
- Health: `http://localhost:4000/health`
- Lokal MySQL (masalan Homebrew) ishlatilsa: `CREATE DATABASE abutax; CREATE USER 'abutax'@'localhost' IDENTIFIED BY 'abutax'; GRANT ALL ON abutax.* TO 'abutax'@'localhost';`
- MinIO konsoli: `http://localhost:9001` (minioadmin / minioadmin)

Hammasini Docker ichida ishga tushirish: `docker compose up -d --build`. `api` konteyneri ishga tushganda migratsiyalarni o'zi qo'llaydi. Seed'ni host'dan ishga tushiring: `npm run seed`.

### Seed hisoblari

| Rol | Telefon | Izoh |
|---|---|---|
| Admin | `+998900000001` | |
| Haydovchilar (10) | `+998901110000` … `+998901110009` | Bahodir A. (Cobalt), Sardor R. (Labo), … |
| Yo'lovchilar (12) | `+998932220000` … | |
| Yuk jo'natuvchilar (5) | `+998943330000` … | |
| Qo'shimcha demo (`npm run seed:demo`) | `+998991000000` … | 60 haydovchi, 80 yo'lovchi, 20 yuk egasi, 14 kunlik safarlar, yuklar, safar so'rovlari, sharhlar |

`npm run seed` bazani tozalab qayta to'ldiradi; `npm run seed:demo` esa mavjud ma'lumotlarni **o'chirmasdan** qo'shadi (qayta ishga tushirilsa takrorlanmaydi). Ikkalasi ham `NODE_ENV=production` da ishlamaydi.

Kirish faqat Telegram bot orqali: botga raqamini yuborgan foydalanuvchi seed'dagi hisobiga avtomatik bog'lanadi (raqam mos kelsa).

**Botsiz lokal ishlab chiqish** (bot token yo'q bo'lsa) — botning ichki so'rovini o'zingiz yuboring:
```bash
SECRET=$(grep ^BOT_API_SECRET .env | cut -d= -f2)
curl -s -X POST localhost:4000/api/v1/internal/bot/login-code -H "X-Bot-Secret: $SECRET" \
  -H 'Content-Type: application/json' -d '{"telegramId":"1","phone":"+998900000001"}'
# → {"data":{"code":"K7M4QX",...}} → saytda yoki: POST /api/v1/auth/code {"code":"K7M4QX"}
```

### Admin
Production'da seed ishlamaydi — birinchi admin CLI orqali beriladi (hisob yo'q bo'lsa oldindan yaratiladi):
```bash
npm run admin -- grant +998901234567                                   # dev
docker compose exec api node dist/cli/admin.js grant +998901234567     # production
node dist/cli/admin.js list | revoke +998...
```
Keyin admin botga **aynan shu raqamni** yuboradi — Telegram akkaunti hisobga bog'lanadi.

**Admin panel paroli** (saytdagi `/admin/login` sahifasi uchun; oddiy foydalanuvchilarda parol yo'q):
```bash
npm run admin -- password +998901234567                                # parol ikki marta so'raladi, ekranda ko'rinmaydi
docker compose exec api node dist/cli/admin.js password +998901234567  # production
```
Talab: kamida 8 belgi, harf va raqam, telefon raqamini o'z ichiga olmaydi. Parol o'rnatilganda adminning barcha sessiyalari yopiladi.

**Haydovchi tarifi (pullik, 30 kun).** Admin panel → "Tarif sozlamalari": yoqish, narx, kunlar, bepul sinov kunlari, karta raqami va egasi, chek yuboriladigan Telegram, Payme/Click merchant ID. Tarif yoqilganda to'lamagan haydovchi ro'yxatdan o'tadi va safar e'lon qiladi, lekin yo'lovchini tasdiqlay olmaydi (raqami ochilmaydi), safar so'rovini (sayt va bot) ololmaydi, yukka taklif bera olmaydi — `402 SUBSCRIPTION_REQUIRED`, saytda "Tarif kerak" oynasi chiqadi. Haydovchi `/driver/tariff` sahifasida kartaga o'tkazib chekni yuklaydi (yoki Telegram'da yuboradi, yoki Payme/Click tugmasi). Admin "To'lovlar" bo'limida chekni ko'rib tasdiqlaydi — obuna 30 kunga (faol bo'lsa tugash sanasidan) uzayadi, haydovchiga Telegram'da xabar boradi. Chek Telegram'da kelgan bo'lsa — mijoz kartasidan "Tarif berish". Cron har kuni 10:00 da "tugashiga 3 kun qoldi" va "tugadi" xabarlarini yuboradi.

> Payme/Click: hozir tugma to'lov sahifasini ochadi (buyurtma raqami = to'lov ID), to'lovni admin tasdiqlaydi. Avtomatik tasdiqlash uchun Payme Merchant API va Click SHOP API ulanadi — buning uchun ular bilan merchant shartnomasi va kalitlar kerak.

**Admin panel** (`/admin`): umumiy statistika va 30 kunlik grafiklar, mijozlar bazasi (har bir foydalanuvchining to'liq kartasi: bronlar, safarlar, so'rovlar, yuklar, sharhlar, sessiyalar, adminlar amallari), haydovchilarni tekshirish, safar so'rovlari, safarlar, bronlar, yuklar, sharhlar moderatsiyasi, amallar jurnali, CSV (Excel) eksport va parolni almashtirish. Mijoz kartasini ko'rish, eksport va har bir kirish `AuditLog` ga yoziladi.

---

## Testlar

```bash
mysql -uroot -p -e "CREATE DATABASE abutax_test; GRANT ALL ON abutax_test.* TO 'abutax'@'localhost';"
npm test
```

Testlar `.env.test` dagi alohida bazada ishlaydi, migratsiyalar avtomatik qo'llanadi. S3 testlarda xotiradagi mock bilan almashtiriladi, rasmlar esa sharp orqali haqiqiy qayta ishlanadi.

| Yo'nalish | Nima tekshiriladi |
|---|---|
| Auth | bot orqali ro'yxatdan o'tish va hisob bog'lash (PHONE_REQUIRED/PHONE_TAKEN), kod bir martalik/60s/parallel, IP va umumiy limitlar, refresh rotatsiyasi, **qayta ishlatilgan token → barcha sessiyalar yopiladi** |
| Band qilish | **20 kishi bir vaqtda 4 o'ringa — aniq 4 tasi o'tadi**, aralash o'rinlar, bitta foydalanuvchining parallel so'rovlari, parallel bekor qilish |
| Holat o'tishlari | safar, band qilish, yuk, taklif: noto'g'ri o'tishda 409; ikkita taklifni parallel qabul qilishda faqat bittasi o'tadi |
| Ruxsatlar | ~80 ta holatdan iborat matritsa: tokensiz 401, noto'g'ri rol 403, admin endpointlari |
| Kontakt | telefon faqat CONFIRMED yoki ACCEPTED holatidan keyin ochiladi |
| Xavfsizlik | `src/test/security.test.ts`: identifikatsiya faqat Telegram orqali, o'rinlarni egallab qo'yish, XSS orqali token o'g'irlash, `alg:none`, dekompressiya bombasi, IDOR, bloklash oqibatlari, socket token muddati. Tafsilotlar: [SECURITY.md](SECURITY.md) |
| Boshqalar | fayllar (format, 5MB, webp va 1600px), sharhlar, reyting, bildirishnomalar, Socket.IO xonalari, cron, statistika, OpenAPI |

---

## Loyiha tuzilmasi

```
src/
  config/env.ts            muhit o'zgaruvchilari (zod bilan tekshiriladi)
  lib/                     prisma (+ deadlock'da qayta urinish), s3, jwt, errors, i18n, images, realtime, stateMachine...
  middlewares/             auth, role, rateLimit, validate, upload, errorHandler
  modules/<nom>/           *.routes, *.controller, *.service, *.schema (zod), *.test
     auth users cities drivers vehicles documents trips bookings cargo reviews notifications admin
  sockets/                 Socket.IO (JWT, user:{id} xonalari)
  jobs/                    node-cron vazifalari (MySQL `JobLock` qulfi bilan)
  docs/openapi.ts          zod sxemalaridan OpenAPI
prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
```

---

## Frontend uchun asosiy qoidalar

### Javob formati
```json
{ "success": true, "data": {}, "meta": { "nextCursor": "..." } }
{ "success": false, "error": { "code": "TRIP_FULL", "message": "Safarda bo'sh o'rin qolmadi", "fields": {} } }
```
- Xato kodlari to'liq ro'yxati: `src/lib/errors.ts` (Swagger'da `ErrorResponse.code`).
- Til: `Accept-Language: uz` yoki `ru`.
- Sanalar: ISO 8601 (UTC). Frontend ularni `Asia/Tashkent` vaqtida ko'rsatadi. Qidiruvda `date=YYYY-MM-DD` Toshkent sanasi sifatida olinadi.
- Narxlar: butun son, so'mda.
- Pagination: `?limit=20&cursor=<meta.nextCursor>`.

### Autentifikatsiya
1. **Parolsiz, Telegram bot orqali** (42.uz uslubi). Saytda: "@AbuTaxBot ga kiring va 1 daqiqalik kodni oling" + 6 ta katak. Foydalanuvchi botda `/start` → **📱 Raqamni yuborish** (Telegram kontakti — raqam egasi Telegram tomonidan tasdiqlangan) → bot 6 belgili kod beradi (`K7M4QX`, katta-kichik harf farqi yo'q) → `POST /auth/code { code }`. Ro'yxatdan o'tish ham, kirish ham shu: hisob bot tomonidan yaratiladi yoki raqam bo'yicha mavjudiga bog'lanadi. Parol yo'q — "parolni tiklash" ham kerak emas.
2. Javobda `accessToken` (15 daqiqa) keladi. Uni `Authorization: Bearer <token>` sarlavhasida yuboring.
3. Refresh token (30 kun) httpOnly cookie'da saqlanadi (`path=/api/v1/auth`). Brauzerdan `credentials: 'include'` bilan `POST /auth/refresh` chaqiriladi.
4. Mobil ilova `X-Client: mobile` sarlavhasini yuboradi (Origin'siz). Ularga refresh token body'da ham qaytadi va `/auth/refresh` ga `{ refreshToken }` ko'rinishida yuboriladi.
5. `isNew: true` yoki `user.role === null` bo'lsa, foydalanuvchi rol tanlashi kerak: `PATCH /users/me/role`. Javobda yangi `accessToken` qaytadi.
6. Haydovchi bo'lish tartibi: `POST /drivers/register` → `POST /drivers/me/documents` (LICENSE va TECH_PASSPORT — ikkalasi majburiy) → `POST /vehicles` → admin tasdiqlaydi → safar e'lon qilish mumkin.
7. Telefon va `telegramUsername` faqat bot orqali yangilanadi (profil orqali o'zgartirib bo'lmaydi) — shuning uchun har bir foydalanuvchida tasdiqlangan raqam bor va kontakt hech qachon bo'sh qolmaydi.
8. Kod xatolari: `LOGIN_CODE_INVALID` (noto'g'ri/eskirgan/ishlatilgan), `LOGIN_ATTEMPTS_LIMIT` (IP: 10 urinish/10 daqiqa, `Retry-After`), `TRY_AGAIN` (tizim bo'yicha noto'g'ri urinishlar ko'payganda vaqtincha).

### Kontaktlar (vositachisiz, lekin xavfsiz)
- Telefon va Telegram faqat band qilish `CONFIRMED` bo'lgandan keyin ochiladi (javobda `contact: { phone, telegramUsername }`). Yuk uchun esa taklif `ACCEPTED` bo'lgandan keyin.
- Ommaviy ro'yxatlarda davlat raqami maskalanadi (`01 A 7**`), ism qisqartiriladi (`Bahodir A.`).
- `GET /trips/:id` token bilan chaqirilsa, `myBooking` maydoni ham qaytadi (tasdiqlangan bo'lsa kontakt bilan).

### Real-time (Socket.IO)
```js
import { io } from 'socket.io-client';
const socket = io(API_URL, { auth: { token: accessToken } });
socket.on('notification:new', (n) => { /* badge++ */ });
socket.on('booking:new', (p) => { /* haydovchi: yangi so'rov */ });
```
Hodisalar: `booking:new`, `booking:updated`, `trip:updated`, `cargo:offer:new`, `cargo:offer:updated`, `cargo:updated`, `driver:status`, `notification:new`. Har bir hodisa `Notification` jadvaliga ham yoziladi (`GET /notifications`).

---

## Biznes qoidalari (qisqacha)

- **Limitlar:** bir vaqtda ≤3 ta tasdiqlanmagan va ≤10 ta faol band qilish. Tasdiqlanmagan band qilish 3 soatdan keyin avtomatik bekor bo'ladi va o'rin qaytariladi. Haydovchida ≤20 ta faol safar, jo'natuvchida ≤10 ta ochiq yuk so'rovi.
- **Overbooking yo'q.** O'rin bitta atomik `UPDATE ... WHERE availableSeats >= seats` so'rovi bilan kamaytiriladi. Bitta yo'lovchining bitta safarda faqat bitta faol band qilishi foydalanuvchi qatorini `SELECT ... FOR UPDATE` bilan qulflab tekshiriladi. InnoDB deadlock'ida tranzaksiya avtomatik qayta bajariladi. Rad etilgan yoki bekor qilingan band qilishda o'rin qaytariladi.
- **Holatlar** faqat ruxsat etilgan yo'nalishda o'zgaradi (`*.state.ts`), aks holda 409 qaytadi. Barcha o'tishlar `WHERE status = <kutilgan>` sharti bilan bajariladi, shuning uchun parallel so'rovlarda ham xavfsiz.
- Faqat `APPROVED` haydovchi safar e'lon qiladi va yukka taklif beradi. Bloklangan foydalanuvchi faqat o'qiy oladi, sessiyalari yopiladi.
- **Bekor qilish.** Yo'lovchi safar boshlanmaguncha bekor qila oladi. Jo'nashga 2 soatdan kam qolgan bo'lsa `cancelledLate: true` belgilanadi (keyinchalik reyting uchun).
- Safarni jo'nashdan 2 soat oldin boshlash mumkin. Safar boshlanganda tasdiqlanmagan so'rovlar avtomatik rad etiladi.
- **Yuk.** Bitta yukka faqat bitta `ACCEPTED` taklif bo'ladi (bu ham index bilan kafolatlangan). Qolgan takliflar avtomatik `REJECTED` bo'ladi.
- **Sharh.** Faqat `COMPLETED` safar yoki `DELIVERED` yukdan keyin 14 kun ichida yoziladi. Bitta muallif bitta sharh qoldira oladi. Sharhdan keyin haydovchi reytingi qayta hisoblanadi.
- **Telegram bildirishnomalari:** backend hodisani `Notification` jadvaliga yozadi; bot har 5 soniyada yuborilmaganlarini olib Telegram'ga jo'natadi (outbox, `telegramSentAt`). Backend Telegram tokenini bilmaydi.
- **Safar so'rovlari** (`/ride-requests`). Safar topilmasa, yo'lovchi so'rov qoldiradi (≤3 ta ochiq). U avval shu yo'nalishdagi haydovchilarga bot orqali, `RIDE_REQUEST_GROUP_DELAY_MIN` daqiqadan keyin esa Telegram guruhga yuboriladi. Haydovchi narx yozib oladi (atomik: ikki haydovchidan faqat bittasi o'tadi). Yo'lovchiga haydovchi, mashina, narx va telefon boradi. Admin tashqi haydovchini qo'lda biriktira oladi. Holatlar: `OPEN → ASSIGNED | CANCELLED | EXPIRED`, `ASSIGNED → CANCELLED`.
- **Bloklash** sabab bilan qilinadi (`blockReason`). Bloklangan foydalanuvchining safar so'rovlari ham bekor bo'ladi.
- **Cron** (Asia/Tashkent, MySQL qulfi bilan):
  - har 5 daqiqada: muddati o'tgan `PENDING` band qilishlar `REJECTED` bo'ladi, o'rin qaytariladi;
  - har 10 daqiqada: jo'nashdan 12 soat o'tgan `IN_PROGRESS` safarlar `COMPLETED` bo'ladi; jo'nashdan 3 soat o'tgan `SCHEDULED` safarlar `CANCELLED` bo'ladi;
  - har kuni 00:05: sanasi o'tgan ochiq safar so'rovlari `EXPIRED` bo'ladi;
  - har kuni 03:00: 30 kundan eski `OPEN` yuklar `CANCELLED` bo'ladi;
  - har kuni 04:30: muddati o'tgan refresh tokenlar o'chiriladi.

## Fayllar
- Faqat JPG, PNG yoki WEBP qabul qilinadi, hajmi 5MB gacha. Format sarlavhaga qarab emas, fayl mazmuniga qarab sharp bilan tekshiriladi. Rasm 1600px gacha kichraytiriladi, WEBP'ga o'tkaziladi, EXIF olib tashlanadi.
- Haydovchi hujjatlari **private** bucket'da saqlanadi. Ularni faqat egasi va admin 10 daqiqalik signed URL orqali ko'ra oladi.
- Mashina, yuk va avatar rasmlari **public** bucket'da saqlanadi.

## Xavfsizlik
To'liq audit, tuzatilgan 20 ta zaiflik va qolgan xavflar: **[SECURITY.md](SECURITY.md)**.

Qisqacha: helmet; CORS faqat `FRONTEND_URL` uchun; IP (IPv6 /64) bo'yicha rate limit va `Retry-After`; bot kodi 32^6 variantli, bir martalik va 60 soniyalik, IP va umumiy urinish limitlari bilan; barcha kirishlar zod `strict` bilan tekshiriladi; fayllar mazmuniga qarab tekshiriladi (≤40 MP); SQL faqat Prisma orqali; production'da xavfli sozlamalar bilan server ishga tushmaydi; admin amallari `AuditLog` ga yoziladi; logda telefon va tokenlar yashiriladi.

---

## Muhit o'zgaruvchilari

| O'zgaruvchi | Izoh |
|---|---|
| `DATABASE_URL` | MySQL ulanishi: `mysql://USER:PAROL@HOST:3306/abutax` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | kamida 32 belgi (`openssl rand -hex 32`) |
| `FRONTEND_URL` | CORS uchun ruxsat etilgan manzil |
| `BOT_API_SECRET` | bot bilan umumiy maxfiy kalit (`bot/.env` dagi bilan bir xil, kamida 32 belgi) |
| `BOT_USERNAME` | bot username'i (@ siz), saytda ko'rsatish uchun |
| `CRON_ENABLED` | fon vazifalari (standart qiymati `true`) |
| `TRUST_PROXY` | nechta proxy ortida (nginx → `1`). API to'g'ridan-to'g'ri ochiq bo'lsa `0` |
| `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | frontend va API turli saytlarda bo'lsa `none` (faqat HTTPS) |
| `RATE_LIMIT_PER_MIN` | IP bo'yicha umumiy limit (mobil operatorlarning CGNAT'ini hisobga oling) |
| `DOCS_ENABLED` | Swagger `/docs` (production'da `false` tavsiya etiladi) |
| `MYSQL_*`, `MINIO_ROOT_*` | docker-compose servislarining hisoblari (production'da albatta o'zgartiring) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | S3 yoki MinIO |
| `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE` | bucket nomlari. Bucket'lar ishga tushishda avtomatik yaratiladi |
| `S3_PUBLIC_URL` | public rasmlar uchun tashqi URL (CDN yoki `https://cdn.abutax.uz`) |
| `PORT` | standart qiymati 4000 |

---

## Joriy production

Sayt: **https://abutax.duckdns.org** — Ubuntu 22.04 VPS, Docker'siz:

- kod `/abutax` da; `abutax-api` (API, `127.0.0.1:4100`) va `abutax-bot` systemd xizmatlari alohida `abutax` tizim foydalanuvchisi nomidan ishlaydi;
- MySQL 8 serverning o'zida, rasmlar lokal diskda (`uploads/`);
- Caddy: HTTPS (Let's Encrypt, avtomatik yangilanadi), `frontend/app/dist` statik fayllari, `/api`, `/socket.io`, `/uploads` → API; `/api/v1/internal/*` tashqaridan 404.

Yangilash:
```bash
cd /abutax && git pull
cd backend && npm ci && npx prisma migrate deploy && npm run build
cd ../bot && npm ci && npm run build
cd ../frontend/app && npm ci && npm run build
systemctl restart abutax-api abutax-bot
```

## Deploy (VPS + Docker + nginx + SSL) — muqobil variant

0. **Bot:** @BotFather → `/newbot` → token'ni `bot/.env` dagi `BOT_TOKEN` ga yozing; `BOT_API_SECRET` ni ikkala `.env` ga bir xil qilib yozing; `WEB_URL=https://abutax.uz`. Bot username'ini `backend/.env` dagi `BOT_USERNAME` ga yozing (sayt kirish sahifasida ko'rsatiladi). Bot `docker compose` ichida avtomatik ishga tushadi (long polling — webhook/SSL shart emas).

1. Serverga Docker va Docker Compose'ni o'rnating, repozitoriyani klonlang.
2. `backend/.env` faylini yarating: `NODE_ENV=production`, kuchli JWT sirlari, `FRONTEND_URL=https://abutax.uz`, kuchli `BOT_API_SECRET`, `S3_PUBLIC_URL=https://cdn.abutax.uz/abutax-public`. MinIO paroli standart bo'lmasin.
3. `docker-compose.yml` dagi barcha portlar faqat `127.0.0.1` ga ochiladi, shuning uchun tashqaridan faqat nginx orqali kirish mumkin. `.env` da `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` va `MINIO_ROOT_PASSWORD` ni kuchli qiymatlarga almashtiring. Xavfli sozlama qolsa, server ishga tushmaydi va sababini logga yozadi.
4. `docker compose up -d --build`. Migratsiyalar konteyner ishga tushganda qo'llanadi.
5. `docker compose up -d --build` beshta servisni ishga tushiradi: `mysql`, `minio`, `api`, `bot` va `web` (sayt). Sayt, API va fayllar **bitta domenda** ishlaydi: `web` konteyneridagi nginx `/api`, `/socket.io` va `/uploads` so'rovlarini `api` ga yo'naltiradi, `/api/v1/internal/` ni esa tashqaridan yopadi (`frontend/app/nginx.conf`). Host nginx (`/etc/nginx/sites-available/abutax.uz`) faqat shu konteynerga yo'naltiradi:

```nginx
server {
    server_name abutax.uz www.abutax.uz;
    client_max_body_size 30m;               # 5 ta rasm × 5MB

    location / {
        proxy_pass http://127.0.0.1:8080;   # web konteyneri
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Socket.IO (WebSocket)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 75s;
    }
}
```

   Muhim: so'rov ikkita proxy'dan (host nginx → web nginx) o'tgani uchun `backend/.env` da `TRUST_PROXY=2` bo'lishi kerak, aks holda IP limitlari noto'g'ri ishlaydi.
6. SSL: `sudo certbot --nginx -d abutax.uz -d www.abutax.uz` (sertifikat avtomatik yangilanadi).
7. Refresh cookie `Secure` (production'da) va `SameSite=Lax` bilan beriladi. Sayt va API bir domenda bo'lgani uchun qo'shimcha CORS yoki cookie sozlamasi kerak emas.
8. Zaxira nusxa: `docker compose exec mysql sh -c 'mysqldump --single-transaction -uroot -p"$MYSQL_ROOT_PASSWORD" abutax' > backup.sql` buyrug'ini cron orqali har kuni bajaring.

> **MinIO haqida:** MinIO 2025 yildan beri tayyor binar va yangi Docker image'larni tarqatmayapti. `minio/minio:latest` hozircha ishlaydi, lekin production uchun boshqaruvli S3-mos xizmatni (AWS S3, Cloudflare R2, DigitalOcean Spaces va h.k.) ishlatish tavsiya etiladi. Buning uchun faqat `S3_*` o'zgaruvchilari o'zgartiriladi.
