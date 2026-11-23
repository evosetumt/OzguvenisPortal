import { api, getToken } from './api';
import { storeSet } from './storage';
import { DEFAULT_PREFS, chromeColor, mergePrefs, normalizePrefs, resolveTheme, type Theme, type ThemePref, type UiPrefs } from './palette';

/**
 * Görünüm tercihleri: mod (açık/koyu/otomatik) ve renk teması (palet).
 * Kullanıcı hesabında saklanır (PATCH /me {ui}); her cihazda aynı görünür. İlk boyamada yanıp sönmesin diye
 * son tercih bu cihazda da önbelleklenir (public/theme-init.js ilk boyamadan önce okur).
 * <html data-theme data-palette> ile uygulanır (styles/theme.css, styles/appearance.css).
 */
export { PALETTES } from './palette';
export type { PaletteId, Theme, ThemePref, UiPrefs } from './palette';

const KEY = 'ozg-ui';
const LEGACY_KEY = 'ozg-theme';
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : undefined;

function readCache(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizePrefs(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark') return { ...DEFAULT_PREFS, theme: legacy };
  } catch { /* depolama kapalı veya bozuk kayıt: varsayılan */ }
  return { ...DEFAULT_PREFS };
}

let prefs: UiPrefs = typeof window !== 'undefined' ? readCache() : { ...DEFAULT_PREFS };
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const current = (): Theme => resolveTheme(prefs.theme, !!media?.matches);

function apply() {
  const el = document.documentElement;
  const theme = current();
  el.dataset.theme = theme;
  el.dataset.palette = prefs.palette;
  el.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chromeColor(theme));
  for (const fn of listeners) fn();
}

export const getPrefs = (): UiPrefs => prefs;
/** O an geçerli (çözülmüş) tema; "otomatik"te sistemin teması. */
export const getTheme = (): Theme => current();

/**
 * Tercihi uygular; save: hesaba da yazar (giriş yapılmışsa). Sunucudan gelen (eski biçimli olabilecek) tercih
 * save=false ile uygulanır; normalizePrefs eski vurgu rengini palete çevirir.
 */
export function setPrefs(change: Partial<UiPrefs> | Record<string, unknown>, save = true) {
  prefs = mergePrefs(prefs, change as Record<string, unknown>);
  apply();
  storeSet(KEY, JSON.stringify(prefs));
  if (save && getToken()) {
    // Art arda seçimler (mod → palet) tek istekte ve tercihin tamamıyla gider; kısmi istekler sunucuda yarışabiliyordu.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void api('/me', { method: 'PATCH', body: JSON.stringify({ ui: prefs }) }).catch(() => undefined), 400);
  }
}

/** Üst çubuktaki tema düğmesi: açık/koyu arasında geçer (otomatik tercihi bırakılır). */
export const setTheme = (t: Theme) => setPrefs({ theme: t });
export const setThemePref = (t: ThemePref) => setPrefs({ theme: t });

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function initTheme() {
  apply();
  // Otomatik temada sistem açık/koyu değişince uygulama da değişsin.
  media?.addEventListener?.('change', () => { if (prefs.theme === 'auto') apply(); });
}
