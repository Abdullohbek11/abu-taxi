import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api';
import { useAuth } from './auth';

/**
 * Socket.IO: backend hodisalarida tegishli ma'lumotlar qayta yuklanadi
 * (band qilish so'rovi kelsa — haydovchi ro'yxati, tasdiqlansa — yo'lovchining safarlari va h.k.).
 */
const EVENT_KEYS: Record<string, string[][]> = {
  'notification:new': [['notifications']],
  'booking:new': [['driver'], ['trip']],
  'booking:updated': [['bookings'], ['trip'], ['driver']],
  'trip:updated': [['bookings'], ['trip'], ['search']],
  'cargo:offer:new': [['cargo']],
  'cargo:offer:updated': [['cargo'], ['offers']],
  'cargo:updated': [['cargo'], ['offers']],
  'driver:status': [['driver'], ['me']],
  'ride:request:new': [['rideRequests']],
  'ride:request:assigned': [['rideRequests']],
  'ride:request:taken': [['rideRequests']],
  'ride:request:updated': [['rideRequests']],
};

export function useRealtime() {
  const { user, reloadMe } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const socket = io({ auth: (cb) => cb({ token: getAccessToken() }), transports: ['websocket'] });
    for (const [event, keys] of Object.entries(EVENT_KEYS)) {
      socket.on(event, () => {
        for (const key of keys) void qc.invalidateQueries({ queryKey: key });
        if (event === 'driver:status') void reloadMe();
      });
    }
    // Token muddati tugaganda server uzadi — yangilab qayta ulanamiz
    socket.on('disconnect', async (reason) => {
      if (reason === 'io server disconnect' && (await refreshSession())) socket.connect();
    });
    return () => {
      socket.disconnect();
    };
  }, [user?.id, qc, reloadMe]);
}
