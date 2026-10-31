import { api, getToken } from './api';
import { storeSet } from './storage';

/**
 * Görünüm tercihleri: tema (açık/koyu/otomatik), duvar kâğıdı, vurgu rengi.
 * Kullanıcı hesabında saklanır (PATCH /me {ui}); her cihazda aynı görünür. İlk boyamada yanıp sönmesin diye
 * son tercih bu cihazda da önbelleklenir. <html data-theme data-wallpaper data-accent> ile uygulanır (styles/appearance.css).
 */
export type Theme = 'dark' | 'light';
export type ThemePref = Theme | 'auto';
export interface UiPrefs { theme: ThemePref; wallpaper: string; accent: string }

export const WALLPAPERS: { id: string; label: string }[] = [
  { id: 'duz', label: 'Varsayılan' },
  { id: 'kul', label: 'Kül' },
  { id: 'kum', label: 'Kum' },
  { id: 'adacayi', label: 'Adaçayı' },
  { id: 'kutup', label: 'Kutup ışığı' },
  { id: 'duman', label: 'Duman' },
  { id: 'gelgit', label: 'Gelgit' },
  { id: 'cicek', label: 'Çiçek' },
  { id: 'kor', label: 'Kor' },
  { id: 'koru', label: 'Koru' },
  { id: 'alacakaranlik', label: 'Alacakaranlık' },
];

export const ACCENTS: { id: string; label: string; color: string }[] = [
  { id: 'mavi', label: 'Mavi', color: '#2f7cf6' },
  { id: 'mor', label: 'Mor', color: '#8b5cf6' },
  { id: 'pembe', label: 'Pembe', color: '#e8457c' },
  { id: 'turuncu', label: 'Turuncu', color: '#f2731c' },
  { id: 'yesil', label: 'Yeşil', color: '#22a55a' },
  { id: 'grafit', label: 'Grafit', color: '#6b7280' },
  { id: 'altin', label: 'Özgüveniş altını', color: '#b08d48' },
];

const KEY = 'ozg-ui';
const LEGACY_KEY = 'ozg-theme';
const DEFAULTS: UiPrefs = { theme: 'auto', wallpaper: 'duz', accent: 'mavi' };
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : undefined;

function readCache(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark') return { ...DEFAULTS, theme: legacy };
  } catch { /* depolama kapalı */ }
  return { ...DEFAULTS };
}

let prefs: UiPrefs = typeof window !== 'undefined' ? readCache() : { ...DEFAULTS };

const resolve = (t: ThemePref): Theme => (t === 'auto' ? (media?.matches ? 'light' : 'dark') : t);

function apply() {
  const el = document.documentElement;
  el.dataset.theme = resolve(prefs.theme);
  el.dataset.wallpaper = prefs.wallpaper;
  el.dataset.accent = prefs.accent;
  for (const fn of listeners) fn();
}

export const getPrefs = (): UiPrefs => prefs;
/** O an geçerli (çözülmüş) tema; "otomatik"te sistemin teması. */
export const getTheme = (): Theme => resolve(prefs.theme);

/** Tercihi uygular; save: hesaba da yazar (giriş yapılmışsa). Sunucudan gelen tercih save=false ile uygulanır. */
export function setPrefs(change: Partial<UiPrefs>, save = true) {
  prefs = { ...prefs, ...change };
  apply();
  storeSet(KEY, JSON.stringify(prefs));
  if (save && getToken()) {
    // Art arda seçimler (tema → duvar kâğıdı → renk) tek istekte ve tercihin tamamıyla gider;
    // ayrı ayrı kısmi istekler sunucuda yarışıp birbirinin değişikliğini siliyordu.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void api('/me', { method: 'PATCH', body: JSON.stringify({ ui: prefs }) }).catch(() => undefined), 400);
  }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Üst çubuktaki tema düğmesi: açık/koyu arasında geçer (otomatik tercihi bırakılır). */
export const setTheme = (t: Theme) => setPrefs({ theme: t });

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function initTheme() {
  apply();
  // Otomatik temada sistem açık/koyu değişince uygulama da değişsin.
  media?.addEventListener?.('change', () => { if (prefs.theme === 'auto') apply(); });
}
