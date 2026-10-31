import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { connectRealtime } from './realtime';

/**
 * Adresin ilk parçası → sunucunun "data:changed" konuları (apps/api/src/prisma/prisma.service.ts → TOPICS). Bu konulardan
 * birinde veri değişince (başka bir kullanıcı ya da başka bir cihaz) ekran verisini kendiliğinden yeniden çeker.
 * Sohbet kendi anlık olaylarıyla güncellendiği için burada yok.
 */
const LIVE: Record<string, string[]> = {
  tasks: ['tasks'], 'task-statuses': ['tasks'], projects: ['tasks'],
  meetings: ['meetings', 'tasks'],
  calendar: ['calendar', 'meetings', 'tasks'],
  reports: ['tasks', 'payments', 'expenses', 'process', 'calendar', 'meetings', 'tracking'],
  team: ['users', 'tasks', 'meetings'],
  users: ['users'], departments: ['users'], roles: ['users'], permissions: ['users'],
  erp: ['erp'],
  expenses: ['expenses', 'process'], 'expense-categories': ['expenses'], 'expense-settings': ['settings'],
  payments: ['payments', 'tasks', 'settings'],
  'process-tasks': ['process', 'expenses'], 'process-instances': ['process', 'expenses'], 'process-definitions': ['process'],
  tracking: ['tracking'],
  whatsapp: ['whatsapp', 'users', 'settings'],
  notifications: ['settings'],
};
const topicsFor = (path: string) => LIVE[path.replace(/^\//, '').split(/[/?]/)[0]] ?? [];

/** Arka plandaki sekme/uygulama değişiklikleri biriktirir; ekrana dönünce bir kez yeniler. */
const STALE_AFTER_HIDDEN_MS = 60_000;

/**
 * Tüm useApi kancaları için tek dinleyici takımı: soket "data:changed", yeniden bağlanma ve sekme görünürlüğü.
 * Kanca sayısı kadar dinleyici kurulmaz; tazelenecek kancalar burada seçilir.
 */
interface Live { topics: string[]; refresh(): void }
const live = new Set<Live>();
let hookedSocket: ReturnType<typeof connectRealtime> | null = null;
let visibilityHooked = false;
let pendingWhileHidden = new Set<Live>();
let hiddenAt = 0;

const run = (targets: Iterable<Live>) => {
  if (document.visibilityState !== 'visible') { for (const l of targets) pendingWhileHidden.add(l); return; }
  for (const l of targets) l.refresh();
};

/** Çıkış/girişte soket yeniden kurulur; dinleyiciler o anki sokete bağlanır. */
function hookOnce() {
  const s = connectRealtime();
  if (s === hookedSocket) return;
  hookedSocket = s;
  s.on('data:changed', (e: { topics?: string[] }) => run([...live].filter((l) => e.topics?.some((t) => l.topics.includes(t)))));
  let connectedOnce = s.connected;
  s.on('connect', () => { if (connectedOnce) run(live); connectedOnce = true; }); // kopukken kaçan değişiklikler
  if (visibilityHooked) return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const stale = hiddenAt && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS;
    const targets = stale ? new Set(live) : pendingWhileHidden;
    pendingWhileHidden = new Set();
    run(targets);
  });
}

/** Aynı adrese aynı anda gelen sessiz tazelemeler tek istekte birleşir (bir sayfada aynı listeyi kullanan birkaç bileşen). */
const inflight = new Map<string, Promise<unknown>>();
function fetchShared<T>(path: string): Promise<T> {
  let p = inflight.get(path) as Promise<T> | undefined;
  if (!p) {
    p = api<T>(path).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return p;
}

/** Veri yükleme kancası: yükle, hata göster, elle yenile; başka yerde değişen veriyi kendiliğinden tazeler. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!path);
  const lastJson = useRef(''); // son verinin JSON'u; yalnız sessiz tazelemede (gerekince) hesaplanır
  const lastData = useRef<T | null>(null);

  const fetchData = useCallback(async (silent: boolean) => {
    if (!path) return;
    if (!silent) setLoading(true);
    try {
      const next = await (silent ? fetchShared<T>(path) : api<T>(path));
      if (silent) {
        // Sessiz tazelemede veri aynıysa durum değiştirilmez (açık formlar, kaydırma konumu bozulmasın).
        const j = JSON.stringify(next);
        if (j === (lastJson.current ||= JSON.stringify(lastData.current))) return;
        lastJson.current = j;
      } else lastJson.current = '';
      lastData.current = next;
      setData(next);
      setError('');
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [path]);

  const reload = useCallback(() => fetchData(false), [fetchData]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!path) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const entry: Live = {
      topics: topicsFor(path),
      // aynı anda gelen birkaç değişiklik tek istek olsun
      refresh: () => { clearTimeout(timer); timer = setTimeout(() => void fetchData(true), 250); },
    };
    hookOnce();
    live.add(entry);
    return () => { clearTimeout(timer); live.delete(entry); pendingWhileHidden.delete(entry); };
  }, [path, fetchData]);

  return { data, setData, error, loading, reload };
}

export const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
