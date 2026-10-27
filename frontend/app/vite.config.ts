import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = 'http://localhost:4000';

// Sayt va API bir manzildan (same-origin): refresh cookie, Socket.IO va fayllar CORS'siz ishlaydi.
// Production'da xuddi shu yo'llarni nginx proxy qiladi (Dockerfile + nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': { target: API, ws: true },
      '/uploads': { target: API },
      '/files': { target: API },
    },
  },
});
