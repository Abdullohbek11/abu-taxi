import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { setIo, userRoom } from '../lib/realtime.js';

/**
 * Socket.IO: ulanish JWT access token bilan (handshake.auth.token yoki Authorization sarlavhasi).
 * Har foydalanuvchi o'z xonasiga (user:{id}) qo'shiladi.
 * Eslatma: adapter yo'q — bitta API instansiyasi uchun. Gorizontal kengaytirishda sticky session + adapter kerak bo'ladi.
 */
export function initSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
    serveClient: false,
    // Klient serverga hech narsa yubormaydi — katta xabarlar bilan xotirani to'ldirishning oldini olish
    maxHttpBufferSize: 4 * 1024,
    connectTimeout: 10_000,
  });


  io.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      if (!raw) throw new AppError('UNAUTHORIZED');
      const { sub: userId, exp } = verifyAccessToken(raw);
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isBlocked: true } });
      if (!user) throw new AppError('UNAUTHORIZED');
      if (user.isBlocked) throw new AppError('USER_BLOCKED');
      socket.data.userId = user.id;
      socket.data.exp = exp;
      next();
    } catch (err) {
      next(new Error(err instanceof AppError ? err.code : 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(userRoom(userId));

    // Token muddati tugaganda ulanish uziladi — klient yangi token bilan qayta ulanadi
    const ttl = (socket.data.exp as number) * 1000 - Date.now();
    const timer = setTimeout(() => socket.disconnect(true), Math.max(ttl, 0));
    socket.on('disconnect', () => clearTimeout(timer));
    logger.debug({ userId }, 'Socket ulandi');
  });

  setIo(io);
  return io;
}
