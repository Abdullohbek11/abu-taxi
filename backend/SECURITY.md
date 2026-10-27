# Xavfsizlik — audit natijalari va himoya choralari

Oxirgi audit: 2026-10-01. Har bir tuzatilgan zaiflik uchun `src/test/security.test.ts` da hujumni amalda sinaydigan regressiya testi bor.

## Telegram bot orqali kirish (2026-10-01)

SMS OTP va Telegram Login Widget olib tashlandi. Kirish va ro'yxatdan o'tish faqat Telegram bot orqali (42.uz uslubi).

| Xavf | Himoya |
|---|---|
| Begona raqamga hisob ochish yoki kirish | Raqam faqat Telegram kontakt tugmasi orqali qabul qilinadi va bot `contact.user_id === from.id` ni tekshiradi, ya'ni raqam egasini Telegram tasdiqlaydi. Telefon va `telegramUsername` profil orqali o'zgartirilmaydi |
| Kodni taxmin qilish (saytda telefon so'ralmaydi, kodning o'zi kalit) | Kod 6 belgidan iborat, 32 belgili alifbo (I, O, 0, 1 yo'q): ≈1,07 mlrd variant. 60 soniya amal qiladi, bir martalik, yangi kod eskisini bekor qiladi. IP bo'yicha 10 urinish/10 daqiqa. Butun tizim bo'yicha daqiqasiga 100 tadan ortiq noto'g'ri urinish bo'lsa, tekshiruv vaqtincha to'xtatiladi (taqsimlangan brute-force'ga qarshi). Bazada faqat HMAC hash saqlanadi |
| Kodni parallel qayta ishlatish | `usedAt IS NULL` sharti bilan atomik belgilanadi, 5 ta parallel so'rovdan faqat bittasi o'tadi |
| Kod so'rash spami | Bitta Telegram foydalanuvchiga 5 ta kod/10 daqiqa va 30 ta kod/sutka, `Retry-After` bilan |
| Qayta sotilgan raqam | Raqam boshqa Telegram akkauntga bog'langan bo'lsa, avtomatik ko'chirilmaydi (`PHONE_TAKEN`, qo'llab-quvvatlash xizmati orqali hal qilinadi) |
| Bot ichki API'si | `X-Bot-Secret` (kamida 32 belgi, vaqtga chidamli solishtirish). Production'da nginx'da `/api/v1/internal/` yopiq, bot API'ga docker tarmog'i orqali ulanadi. Backend Telegram tokenini bilmaydi |
| Telegram ma'lumotidagi firibgarlik | Ism faqat harflardan iborat bo'lsa olinadi (emoji va havola olinmaydi). Noto'g'ri username saqlanmaydi, lekin kirishni to'xtatmaydi |
| Phishing ("kodni ayting") | Bot xabarida ogohlantirish: "Kodni hech kimga bermang — Abu Tax xodimlari uni so'ramaydi" |

**Qolgan xavf:** botnet bilan taqsimlangan hujumda umumiy limit (daqiqasiga 100 urinish) va bir vaqtda ~10 ta faol kod bo'lsa ham, taxmin qilish ehtimoli yiliga bitta hisobdan kam. Agar talab kuchaysa, keyingi qadam — kodni sayt sessiyasiga bog'lash (`t.me/bot?start=<sessiya>` deep-link).

## Topilgan va tuzatilgan zaifliklar

> №1, №7 va №10 qatorlari SMS OTP davriga tegishli. SMS endi olib tashlangan, ular tarix uchun qoldirilgan.

| # | Daraja | Zaiflik | Hujum ssenariysi | Tuzatish |
|---|---|---|---|---|
| 1 | **Yuqori** | OTP kodini taxmin qilish | 4 xonali kod bo'lsa, soatiga 25 urinish va sutkasiga ~6% ehtimol bilan begona hisobni egallash mumkin edi | Raqam bo'yicha sutkalik limitlar: 10 ta kod, 15 ta noto'g'ri urinish. Limit tugagach raqam 24 soatga bloklanadi. Ehtimol ≈0,15%/sutka |
| 2 | **Yuqori** | O'rinlarni egallab qo'yish (DoS) | Bitta foydalanuvchi yoki botlar barcha safarlardagi o'rinlarni `PENDING` holatida band qilib, platformani to'xtatib qo'yishi mumkin edi | Bir vaqtda ≤3 ta `PENDING` va ≤10 ta faol band qilish. Limit atomik: foydalanuvchi qatori `SELECT ... FOR UPDATE` bilan qulflanadi. `PENDING` band qilish 3 soatdan keyin cron orqali bekor qilinadi |
| 3 | **Yuqori** | Refresh token XSS orqali o'g'irlanishi | Sahifadagi zararli skript `X-Client: mobile` sarlavhasini yuborib, httpOnly cookie'dagi 30 kunlik tokenni body orqali olishi mumkin edi | Token body'da faqat haqiqiy mobil klientga qaytadi (`Origin` yo'q, cookie yo'q) |
| 4 | **Yuqori** | Docker portlari internetga ochiq | `0.0.0.0` ga ochilgan ma'lumotlar bazasi. Docker UFW qoidalarini chetlab o'tadi | Portlar faqat `127.0.0.1` ga ochiladi, parollar `.env` dan olinadi. Production'da MySQL `root` yoki standart parol bilan server ishga tushmaydi. API konteyneri `read_only`, `no-new-privileges` |
| 5 | O'rta | Kontaktni soxtalashtirish | Foydalanuvchi o'z profilida `telegramUsername` ga begona akkauntni yozib qo'yishi mumkin edi. Bu username kontakt sifatida boshqa tomonga ko'rsatiladi | Username faqat Telegram imzosi bilan tasdiqlanadi (`POST /users/me/telegram`). Telefon faqat OTP bilan bog'lanadi |
| 6 | O'rta | Dekompressiya bombasi | 5MB lik PNG'ning sarlavhasida 20000×20000 piksel ko'rsatilgan bo'lishi mumkin. Uni ochish uchun gigabaytlab xotira kerak bo'ladi | Rasm 40 MP dan katta bo'lsa, ochilmasdan rad etiladi (`limitInputPixels`). `sharp.concurrency(2)`. Yuklash limiti: foydalanuvchiga soatiga 30 ta |
| 7 | O'rta | OTP tekshiruvidagi poyga holati | Bitta kod bilan parallel yuborilgan so'rovlarning hammasi o'tib ketardi | Tekshiruv bitta Lua skriptida bajariladi (tekshirish, urinishni hisoblash va o'chirish atomik) |
| 8 | O'rta | Bloklash to'liq emas edi | Bloklangan haydovchining safarlari qidiruvda qolardi, yo'lovchilarning band qilishlari saqlanib qolardi, socket ochiq qolardi | Bloklanganda rejalashtirilgan safarlar, band qilishlar, ochiq yuklar va takliflar bekor qilinadi. Boshqa tomonlarga xabar yuboriladi, socket uziladi |
| 9 | O'rta | Admin amallari kuzatilmasdi | Admin shaxsiy hujjatlarni iz qoldirmasdan ko'rishi mumkin edi | `AuditLog`: tasdiqlash, rad etish, bloklash va **hujjatni ko'rish** yoziladi (`GET /admin/audit`) |
| 10 | O'rta | Production'da xavfli sozlamalar | `SMS_PROVIDER=console` OTP kodlarni logga yozadi. `.env.example` dagi namunaviy JWT sirlari. `http://` CORS | Bunday sozlamalar bilan server production'da ishga tushmaydi (`src/config/env.ts`) |
| 11 | O'rta | IP limitlarini aylanib o'tish | `trust proxy` qat'iy `1` edi, API to'g'ridan-to'g'ri ochiq bo'lsa `X-Forwarded-For` soxtalashtirilardi. IPv6 manzillar alohida sanalardi (/64 blokda 2^64 manzil) | `TRUST_PROXY` sozlanadi. IPv6 /64 prefiks bo'yicha sanaladi |
| 12 | Past | Refresh tokenlar chalkashligi | Bir necha tab bir vaqtda yangilaganda tizim buni "o'g'irlik" deb hisoblab, barcha sessiyalarni yopib yuborardi | Rotatsiyadan keyin 10 soniyalik muhlat. Undan keyingi qayta ishlatish hujum hisoblanadi va barcha sessiyalar yopiladi |
| 13 | Past | Token turlarini almashtirish | Access va refresh token o'rtasida `iss`/`aud` farqi yo'q edi | `iss=abutax`, `aud=abutax:access` yoki `abutax:refresh`. `alg` qat'iy HS256 |
| 14 | Past | Uzoq yashovchi socket | Token muddati tugagach ham socket ulanishi ochiq qolardi. Kiruvchi xabar hajmi 1MB gacha edi | Token muddati tugashi bilan socket uziladi. Xabar hajmi 4KB gacha |
| 15 | Past | Yopilgan yukning manzillari | Har qanday haydovchi yopilgan so'rovlardagi uy manzillarini ko'ra olardi | Haydovchi faqat `OPEN` so'rovni yoki o'zi taklif bergan so'rovni ko'radi |
| 16 | Past | Ism va matndagi firibgarlik | `t.me/scam` kabi ismlar, bidi-override (U+202E) va boshqaruv belgilari | Ismlarda faqat harflar ruxsat etiladi. Erkin matndan boshqaruv va bidi belgilari olib tashlanadi |
| 17 | Past | Telegram HTML injeksiyasi | `parse_mode: HTML` bo'lgani uchun matndagi `<`/`>` teg sifatida talqin qilinardi | Qiymatlar HTML-escape qilinadi |
| 18 | Past | Slowloris / katta body | Standart Node timeout'lari (300s), JSON body 1MB gacha | `headersTimeout` 15s, `requestTimeout` 60s, JSON 100KB, multipart maydonlari cheklangan |
| 19 | Past | Bog'liqlik zaifligi | `deepmerge-ts` (prisma CLI orqali, GHSA-ggr8-5vv4-36mx) | `overrides` orqali ^8.0.2. `npm audit`: 0 |
| 20 | Past | Cron qulfi | Sekin ishlagan vazifa boshqa instansiyaning qulfini o'chirib yuborishi mumkin edi | Qulfni faqat egasi o'chiradi (token va Lua) |

Qo'shimcha mustahkamlashlar:
- Admin haydovchini guvohnoma va texpasportsiz tasdiqlay olmaydi.
- Haydovchi bo'lish uchun tasdiqlangan telefon majburiy.
- Spamga qarshi limitlar: ≤20 ta faol safar, ≤10 ta ochiq yuk so'rovi.
- Mashina o'rinlarini faol safardagidan kam qilib bo'lmaydi.
- Loglarda so'rov yo'li query'siz yoziladi, har so'rovga `X-Request-Id` beriladi.
- CORS'da ruxsat etilgan sarlavhalar va usullar ro'yxati aniq ko'rsatilgan.

## Himoya qatlamlari (umumiy)

- **Autentifikatsiya:** Telegram bot kodi (yuqoridagi bo'lim); access token 15 daqiqa; refresh token 30 kun, httpOnly cookie, rotatsiya va qayta ishlatishni aniqlash bilan. Bazada faqat token hash'i saqlanadi.
- **Avtorizatsiya:** har so'rovda foydalanuvchi bazadan o'qiladi, shuning uchun blok va rol darhol kuchga kiradi. Rol middleware'i ishlaydi. Har bir resurs egasi bo'yicha tekshiriladi (begona resurs uchun 404 qaytadi va uning mavjudligi oshkor qilinmaydi). Ruxsatlar matritsasi testi ~90 ta holatni qamraydi.
- **Kiritish:** barcha body, query va params zod `strict` sxemalari bilan tekshiriladi, shuning uchun mass assignment mumkin emas. Fayl formati mazmuniga qarab aniqlanadi. SQL faqat Prisma yoki parametrlangan `$queryRaw` orqali bajariladi.
- **Poyga holatlari:** o'rinlar atomik `UPDATE ... WHERE availableSeats >= n` bilan kamaytiriladi. Holat o'tishlari `WHERE status = <kutilgan>` sharti bilan bajariladi. "Bitta safarda bitta faol band qilish" va "bitta haydovchi — bitta faol taklif" qoidalari tegishli qatorni `FOR UPDATE` bilan qulflab tekshiriladi. Bitta yukka bitta taklif qabul qilinishini atomik `OPEN → MATCHED` o'tishi kafolatlaydi. InnoDB deadlock'ida tranzaksiya avtomatik qayta bajariladi. `CHECK` cheklovlari qo'yilgan.
- **Maxfiylik:** telefon faqat `CONFIRMED` yoki `ACCEPTED` holatidan keyin ochiladi. Davlat raqami maskalanadi, familiya qisqartiriladi. Hujjatlar private bucket'da saqlanadi va 10 daqiqalik signed URL orqali ochiladi. Logda telefon va tokenlar yashiriladi.
- **Transport:** helmet (HSTS, CSP, nosniff, frameguard); CORS faqat `FRONTEND_URL` uchun; production'da cookie `Secure` bilan beriladi.

## 2026-yil 21-oktabr: yangi qismlar auditi

| # | Daraja | Xavf | Tuzatish | Test |
|---|---|---|---|---|
| 21 | **Yuqori** | Admin parolini taxmin qilish (brute force) | scrypt (N=2¹⁵), har parolga tuz; IP bo'yicha 15 daqiqada 10 urinish; login bo'yicha 5 xatodan keyin 30 daqiqa qulf (to'g'ri parol ham o'tmaydi); kuchli parol talabi | `security.admin.test.ts` |
| 22 | O'rta | Admin borligini aniqlash (enumeration) | Noto'g'ri parol, yo'q hisob, admin emas, parolsiz, bloklangan — hammasi bir xil `ADMIN_LOGIN_INVALID`; yo'q hisob uchun ham soxta scrypt hisoblanadi (javob vaqti bir xil); qulf ham kiritilgan login bo'yicha | ✓ |
| 23 | O'rta | O'g'irlangan admin sessiyasi bilan mijozlar bazasini ko'chirish | Eksport soatiga 20 ta (admin bo'yicha), har eksport va har mijoz kartasini ko'rish `AuditLog` ga yoziladi; har parolli kirish haqida adminning Telegram'iga IP bilan xabar | ✓ |
| 24 | O'rta | CSV formula injeksiyasi (`=cmd|...` izohda) | `= + - @` bilan boshlangan katakka `'` qo'shiladi, qo'shtirnoq escape qilinadi | ✓ |
| 25 | O'rta | Safar so'rovlari orqali haydovchilarni Telegram'da spam qilish | Bir vaqtda ≤3 ochiq, kuniga ≤5 ta yaratish (bekor qilish limitni tiklamaydi) | ✓ |
| 26 | Past | Parol hash'ining javobda chiqib qolishi | DTO'lar maydonlarni aniq tanlaydi; testda barcha admin va profil javoblarida `passwordHash`/`scrypt$` yo'qligi tekshiriladi | ✓ |
| 27 | Past | Ikki tab bir vaqtda sessiyani yangilasa — foydalanuvchi chiqib ketardi | Muhlat ichida 409 `REFRESH_IN_PROGRESS`, cookie o'chirilmaydi, mijoz qayta urinadi | `auth.test.ts` |
| 28 | Past | Reyting manipulyatsiyasi | Haydovchi va mijoz reytinglari ajratildi; sharh faqat ishtirokchiga, bitta muallif — bitta; admin haqoratli/soxta sharhni o'chiradi (jurnalga yoziladi, reyting qayta hisoblanadi) | `reviews.test.ts` |

Ruxsatlar matritsasiga barcha yangi endpointlar (safar so'rovlari, admin ma'lumotlar bazasi, eksport, parol) qo'shildi.

## Qolgan xavflar va tavsiyalar

- **Admin uchun ikkinchi omil (2FA):** hozir parol + Telegram ogohlantirishi. Keyingi qadam — paroldan keyin botdan tasdiq kodi.
- **"Olaman" orqali safar sharhi:** safar kuni kelgach ishtirokchilar baho qo'ya oladi; safar haqiqatan bo'lganini tizim tekshira olmaydi (tanish haydovchi orqali soxta baho mumkin). Admin past/shubhali sharhlarni "Sharhlar" bo'limida ko'radi.

- **Access token bekor qilinmaydi:** logout-all'dan keyin ham access token 15 daqiqagacha amal qiladi (bloklash esa darhol ishlaydi). Kerak bo'lsa `tokenVersion` qo'shiladi.
- **Pickup manzili:** yo'lovchining pickup manzili va koordinatasi haydovchiga tasdiqlashdan oldin ko'rinadi. Bu qaror qabul qilishi uchun zarur, lekin maxfiylik talabi kuchaysa, tasdiqlangunga qadar faqat tuman ko'rsatilishi mumkin.
- **Akkauntni o'chirish:** endpoint yo'q (GDPR'ga o'xshash talab paydo bo'lsa, ma'lumotlar anonimlashtiriladi).
- **SMS xarajati yo'q:** SMS olib tashlangani uchun SMS pumping xavfi ham yo'q. Bot faqat `+998` raqamlarni qabul qiladi.
- **Swagger:** production'da `DOCS_ENABLED=false` qilish tavsiya etiladi.
- **Zaxira nusxa va monitoring:** `mysqldump --single-transaction` ni kundalik cron'ga qo'ying. Loglarda `REFRESH_TOKEN_REUSED`, `LOGIN_ATTEMPTS_LIMIT` va `TRY_AGAIN` uchun alert sozlang.

## Zaiflik haqida xabar berish

Topilgan zaiflik haqida ochiq issue ochmang. Uni @abutax_uz ga shaxsiy xabar orqali yuboring.
