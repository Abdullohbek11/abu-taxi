import type { Server } from 'socket.io';

/**
 * Socket.IO instansiyasi. Server ishga tushganda o'rnatiladi;
 * testlarda va cron'da bo'lmasligi mumkin — unda emit jim o'tkazib yuboriladi.
 */
let io: Server | null = null;

export function setIo(server: Server | null) {
  io = server;
}

export const userRoom = (userId: string) => `user:${userId}`;

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(userRoom(userId)).emit(event, data);
}

/** Foydalanuvchining barcha ochiq ulanishlarini uzadi (bloklanganda). */
export function disconnectUser(userId: string) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}
