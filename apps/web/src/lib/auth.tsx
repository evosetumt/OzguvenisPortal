import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import { setPrefs, type UiPrefs } from './theme';

export interface Me {
  id: number;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  phone?: string | null;
  title?: string | null;
  presence?: string;
  department?: { id: number; name: string } | null;
  /** Görünüm tercihleri (hesapta saklı; her cihazda aynı) */
  uiPrefs?: Partial<UiPrefs> | null;
  permissions: Record<string, string>;
}

/** Hesaptaki görünüm tercihini bu cihaza uygular (kaydetmeden). */
const withPrefs = (m: Me) => { if (m.uiPrefs) setPrefs(m.uiPrefs, false); return m; };

interface AuthState {
  me: Me | null;
  loading: boolean;
  login(email: string, password: string, remember: boolean): Promise<void>;
  logout(): void;
  /** Yetkiler değişince (rol düzenlendi) jetonu ve oturum bilgisini yeniler; pasifleştirilmişse çıkış yapar. */
  reloadSession(): Promise<void>;
  can(code: string): boolean;
  /** Profil değişikliğini (fotoğraf, telefon, durum) oturum bilgisine yansıtır. */
  patchMe(change: Partial<Me>): void;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

/** Jeton bu aralıkla yenilenir: "Beni hatırla" süresi kullanıldıkça baştan başlar, izin değişiklikleri yansır. */
const REFRESH_MS = 6 * 3600_000;

/**
 * Sekmeler arası oturum: "Beni hatırla" işaretlenmeden açılan oturum sessionStorage'dadır ve yeni sekmede yoktur;
 * yeni sekme açık bir sekmeden jetonu ister. Çıkış da tüm sekmelere yayılır.
 */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ozg-auth') : null;
type AuthMsg = { t: 'ask' } | { t: 'token'; token: string } | { t: 'logout' };

function askOtherTabs(): Promise<string | null> {
  if (!channel) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (v: string | null) => { channel.removeEventListener('message', on); clearTimeout(timer); resolve(v); };
    const on = (e: MessageEvent<AuthMsg>) => { if (e.data.t === 'token') done(e.data.token); };
    const timer = setTimeout(() => done(null), 300);
    channel.addEventListener('message', on);
    channel.postMessage({ t: 'ask' } satisfies AuthMsg);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const r = await api<{ token: string }>('/auth/refresh', { method: 'POST' });
    setToken(r.token);
  };

  useEffect(() => {
    (async () => {
      let token = getToken();
      if (!token) {
        token = await askOtherTabs();
        if (token) setToken(token, false);
      }
      if (!token) return;
      try {
        await refresh();
        setMe(withPrefs(await api<Me>('/auth/me')));
      } catch {
        setToken(null);
      }
    })().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!me) return;
    const t = setInterval(() => void refresh().catch(() => undefined), REFRESH_MS);
    return () => clearInterval(t);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!channel) return;
    const on = (e: MessageEvent<AuthMsg>) => {
      const token = getToken();
      if (e.data.t === 'ask' && token) channel.postMessage({ t: 'token', token } satisfies AuthMsg);
      if (e.data.t === 'logout') { setToken(null); setMe(null); }
    };
    channel.addEventListener('message', on);
    return () => channel.removeEventListener('message', on);
  }, []);

  const login = async (email: string, password: string, remember: boolean) => {
    const r = await api<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, remember }) });
    setToken(r.token, remember);
    setMe(withPrefs(await api<Me>('/auth/me')));
  };
  const logout = () => {
    setToken(null);
    setMe(null);
    channel?.postMessage({ t: 'logout' } satisfies AuthMsg);
  };
  const can = (code: string) => !!me && code in me.permissions;
  const reloadSession = async () => {
    try {
      await refresh();
      setMe(withPrefs(await api<Me>('/auth/me')));
    } catch {
      logout();
    }
  };

  const patchMe = (change: Partial<Me>) => setMe((m) => (m ? { ...m, ...change } : m));

  return <Ctx.Provider value={{ me, loading, login, logout, reloadSession, can, patchMe }}>{children}</Ctx.Provider>;
}
