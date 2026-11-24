import { useMemo, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from './api';
import { connectRealtime } from './realtime';

/**
 * Bağlantı durumu (WhatsApp'taki "çevrimiçi / son görülme"): kullanıcının portalda açık bir bağlantısı var mı,
 * yoksa en son ne zaman çevrimiçiydi. Kullanıcının elle seçtiği durumdan (Odakta, Toplantıda) ayrıdır.
 * İlk değerler GET /chat/presence ile gelir, sonra "presence:changed" soket olayıyla güncellenir.
 */
export interface OnlineState { online: boolean; lastSeenAt: string | null }
interface PresenceSnapshot { online: number[]; lastSeen: Record<string, string | null> }
interface PresenceChange { userId: number; online: boolean; lastSeenAt?: string | null }

let states = new Map<number, OnlineState>();
const listeners = new Set<() => void>();
let bound: Socket | null = null;

function publish(next: Map<number, OnlineState>) {
  states = next;
  for (const l of listeners) l();
}

/** Sunucudan gelen anlık görüntüyü depoya çevirir (saf işlev, test edilir). */
export function fromSnapshot(s: PresenceSnapshot): Map<number, OnlineState> {
  const online = new Set(s.online);
  const map = new Map<number, OnlineState>();
  for (const [id, at] of Object.entries(s.lastSeen)) map.set(Number(id), { online: online.has(Number(id)), lastSeenAt: at });
  for (const id of online) if (!map.has(id)) map.set(id, { online: true, lastSeenAt: null });
  return map;
}

/** Tek kişinin değişikliğini uygular; önceki "son görülme" korunur. */
export function applyChange(map: Map<number, OnlineState>, c: PresenceChange): Map<number, OnlineState> {
  const next = new Map(map);
  const prev = map.get(c.userId);
  next.set(c.userId, { online: c.online, lastSeenAt: c.lastSeenAt ?? prev?.lastSeenAt ?? null });
  return next;
}

async function refresh() {
  try { publish(fromSnapshot(await api<PresenceSnapshot>('/chat/presence'))); } catch { /* çevrimdışı: eski değerler kalır */ }
}

function ensure() {
  const s = connectRealtime();
  if (bound === s) return;
  bound = s;
  s.on('presence:changed', (c: PresenceChange) => publish(applyChange(states, c)));
  s.on('connect', () => void refresh()); // yeniden bağlanınca kaçırılan değişiklikler
  void refresh();
}

export function useOnline(userId: number | undefined): OnlineState | undefined {
  return useSyncExternalStore(
    (cb) => { ensure(); listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => (userId === undefined ? undefined : states.get(userId)),
  );
}

/** Birden çok kişiden kaçı çevrimiçi (grup başlığı için). */
export function useOnlineCount(userIds: number[]): number {
  return useSyncExternalStore(
    (cb) => { ensure(); listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => userIds.filter((id) => states.get(id)?.online).length,
  );
}

/** Verilen kişilerden çevrimiçi olanların kimlikleri; yalnız küme gerçekten değişince yeni nesne döner. */
export function useOnlineIds(userIds: number[]): Set<number> {
  const key = useSyncExternalStore(
    (cb) => { ensure(); listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => userIds.filter((id) => states.get(id)?.online).join(','),
  );
  return useMemo(() => new Set(key ? key.split(',').map(Number) : []), [key]);
}

/**
 * Avatar noktası: kullanıcı bağlıyken seçtiği duruma göre renklenir (Çevrimiçi yeşil, Odakta mor, Toplantıda turuncu,
 * Uzakta gri); bağlı değilse nokta yoktur. Dönen değer people.ts PRESENCE anahtarıdır.
 */
export function presenceDot(state: OnlineState | undefined, chosen: string | undefined): string | undefined {
  if (!state?.online) return undefined;
  return chosen || 'online';
}

/** Çevrimiçi olanları başa alır; her grubun kendi içindeki sırası korunur, girdi değişmez. */
export function onlineFirst<T extends { id: number }>(list: readonly T[], onlineIds: ReadonlySet<number>): T[] {
  return [...list.filter((x) => onlineIds.has(x.id)), ...list.filter((x) => !onlineIds.has(x.id))];
}

const TIME = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

/** "çevrimiçi", "son görülme bugün 14:32", "son görülme dün 09:10", "son görülme 12 Kas 14:00" */
export function lastSeenLabel(s: OnlineState | undefined, now = new Date()): string {
  if (!s) return '';
  if (s.online) return 'çevrimiçi';
  if (!s.lastSeenAt) return 'çevrimdışı';
  const at = new Date(s.lastSeenAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (at >= startOfToday) return `son görülme bugün ${TIME.format(at)}`;
  if (at >= startOfYesterday) return `son görülme dün ${TIME.format(at)}`;
  return `son görülme ${DAY.format(at)} ${TIME.format(at)}`;
}
