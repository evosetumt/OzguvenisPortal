import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { json } from '../lib/data';
import { timeAgo } from '../lib/format';
import type { Notification } from '../lib/types';
import { useReconnect, useSocketEvent } from '../lib/realtime';

const POLL_MS = 30_000; // WebSocket bağlantısı koparsa yedek olarak periyodik yoklama

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Notification[]; unreadCount: number }>('/notifications');
      setItems(r.items);
      setUnread(r.unreadCount);
    } catch { /* geçici ağ hatası: sonraki yoklamada tekrar dener */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Yeni bildirim WebSocket ile anında gelir; bağlantı yeniden kurulunca kaçırılanlar için liste tazelenir.
  useSocketEvent<Notification>('notification:new', (n) => {
    setItems((xs) => (xs.some((x) => x.id === n.id) ? xs : [n, ...xs].slice(0, 30)));
    setUnread((u) => u + 1);
  });
  useReconnect(() => void load());

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void api(`/notifications/${n.id}/read`, json('POST'));
    }
    if (n.link) nav(n.link);
  };

  const readAll = async () => {
    await api('/notifications/read-all', json('POST'));
    void load();
  };

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" title="Bildirimler" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>
        <Bell size={20} />
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="glass popover">
          <div className="popover-head">
            <b>Bildirimler</b>
            {unread > 0 && <button className="link-btn" onClick={readAll}><CheckCheck size={14} /> Tümünü okundu say</button>}
          </div>
          {items.length === 0 && <p className="empty">Bildirim yok.</p>}
          <ul className="notif-list">
            {items.map((n) => (
              <li key={n.id}>
                <button className={'notif' + (n.readAt ? '' : ' unread')} onClick={() => openItem(n)}>
                  <b>{n.title}</b>
                  {n.body && <span>{n.body}</span>}
                  <small>{timeAgo(n.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
