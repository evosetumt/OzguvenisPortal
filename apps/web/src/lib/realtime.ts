import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

// API ile aynı köken (IIS /api ters proxy) veya Capacitor derlemesinde VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

let socket: Socket | null = null;

/**
 * Tek WebSocket bağlantısı (socket.io, yol /api/socket.io). JWT el sıkışmada gönderilir;
 * yeniden bağlanırken güncel jeton okunur. Bağlantı kurulamazsa socket.io uzun yoklamaya düşer.
 */
export function connectRealtime() {
  if (socket) return socket;
  socket = io(BASE || undefined, {
    path: '/api/socket.io',
    auth: (cb) => cb({ token: getToken() }),
    reconnectionDelayMax: 10_000,
  });
  socket.on('auth_error', () => socket?.disconnect());
  // Portal ekranda mı? Sunucu mesaj bildirimini yalnızca hiçbir cihazda ön planda açık değilse telefona/tarayıcıya iter.
  const report = () => socket?.emit('presence:visible', { visible: document.visibilityState === 'visible' });
  socket.on('connect', report);
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener('visibilitychange', () => { if (socket?.connected) report(); });
  }
  return socket;
}
let visibilityHooked = false;

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;

/** Sunucu olayına abone olur; işleyicinin en güncel hali kullanılır, yeniden abone olmaya gerek kalmaz. */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = connectRealtime();
    const fn = (data: T) => ref.current(data);
    s.on(event, fn);
    return () => { s.off(event, fn); };
  }, [event]);
}

/** Bağlantı yeniden kurulunca (kaçırılmış olaylar için) verileri tazelemek üzere çağrılır. */
export function useReconnect(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = connectRealtime();
    let first = true;
    const fn = () => { if (first) { first = false; return; } ref.current(); };
    if (s.connected) first = false;
    s.on('connect', fn);
    return () => { s.off('connect', fn); };
  }, []);
}

export function emitTyping(conversationId: number) {
  socket?.emit('typing', { conversationId });
}
