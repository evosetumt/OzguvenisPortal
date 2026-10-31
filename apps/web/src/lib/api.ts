const TOKEN_KEY = 'ozg-token';

/**
 * Oturum jetonu: "Beni hatırla" işaretliyse localStorage (7 gün, tarayıcı kapansa da kalır),
 * değilse sessionStorage (tarayıcı kapanınca biter; yeni sekmeler jetonu açık sekmeden alır, bkz. auth.tsx).
 */
export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
/** remember verilmezse (yenileme) jeton bulunduğu yerde güncellenir. null: çıkış, iki yerden de silinir. */
export const setToken = (t: string | null, remember?: boolean) => {
  try {
    if (!t) { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); return; }
    const persist = remember ?? (localStorage.getItem(TOKEN_KEY) !== null && sessionStorage.getItem(TOKEN_KEY) === null);
    (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    (persist ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
  } catch { /* depolama kapalı */ }
};

// Üretimde API aynı alan adından /api altında yayınlanır (IIS ters proxy).
// Capacitor mobil derlemesinde VITE_API_URL ile tam adres verilir.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
/** API'nin verdiği /api/... yollarını mobil derlemede tam adrese çevirir. */
export const apiUrl = (path: string) => (path.startsWith('/api/') ? BASE + path : path);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let msg = 'İstek başarısız';
    try { msg = (await res.json()).message ?? msg; } catch { /* gövde yok */ }
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
