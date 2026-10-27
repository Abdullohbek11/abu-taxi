# Abu Tax — sayt

Vite + React 19 + TypeScript + TanStack Query + Socket.IO. Dizayn `../Abu Tax Landing.dc.html` dagi Claude Design tokenlaridan olingan (ranglar, Poppins/Inter, animatsiyalar).

```bash
npm install
npm run dev      # http://localhost:5173 (backend 4000-portda ishlab turishi kerak)
npm run build    # dist/ — production (Dockerfile + nginx.conf)
```

- **Kirish** — parolsiz, Telegram bot orqali: `.env` dagi `VITE_BOT_USERNAME` (masalan `taxizakRObot`).
- **Tillar** — `src/locales/uz.ts` (asosiy) va `ru.ts`. RU lug'ati barcha kalitlarni talab qiladi: tarjima tushib qolsa, build xato beradi.
- **API** — `src/lib/api.ts`. Access token faqat xotirada saqlanadi, refresh token httpOnly cookie'da. 401 bo'lsa token avtomatik yangilanadi.
- **Real vaqt** — `src/lib/realtime.ts`. Socket.IO hodisalari tegishli ma'lumotlarni qayta yuklaydi.

## Sahifalar

| Yo'l | Sahifa |
|---|---|
| `/` | Landing (qidiruv, haqiqiy statistika va sharhlar) |
| `/login` | Bot kodi bilan kirish (6 ta katak) |
| `/onboarding` | Rol va ism |
| `/search` | Safar qidiruvi va filtrlar |
| `/trips/:id` | Safar, band qilish, tasdiqdan keyin kontakt |
| `/my-trips` | Yo'lovchining band qilishlari va sharh qoldirish |
| `/cargo/new`, `/cargo/my` | Yuk jo'natish, takliflar |
| `/driver` | Haydovchi kabineti: safarlar, hujjat va mashinalar, statistika |
| `/driver/trips/:id` | So'rovlarni tasdiqlash yoki rad etish, safar holati |
| `/driver/cargo` | Ochiq yuk so'rovlari va takliflar |
| `/admin` | Haydovchilarni tasdiqlash, foydalanuvchilarni bloklash |
| `/profile` | Profil, til, rol |
