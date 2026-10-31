import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useReconnect, useSocketEvent } from '../../lib/realtime';
import type { ChatMessage } from '../../lib/types-chat';

/** Okunmamış mesaj toplamı (menü rozeti); yeni mesaj ve okundu olaylarında tazelenir. */
export function useUnreadMessages(meId: number) {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    try { setCount((await api<{ unread: number }>('/chat/unread')).unread); } catch { /* geçici hata */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useReconnect(() => void load());
  useSocketEvent<ChatMessage>('message:new', (m) => { if (m.senderId !== meId) void load(); });
  useSocketEvent<{ userId: number }>('read', (r) => { if (r.userId === meId) void load(); });
  useSocketEvent('conversation:updated', () => void load());
  return count;
}
