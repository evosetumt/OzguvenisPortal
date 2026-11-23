/**
 * Renk temaları (paletler) ve görünüm tercihlerinin saf (DOM'suz) mantığı. lib/theme.ts uygular;
 * renk değerleri styles/appearance.css içindedir. Varsayılan palet b2b.ozguvenis.com.tr ile aynı altın tonlardır.
 */
export type Theme = 'dark' | 'light';
export type ThemePref = Theme | 'auto';
export type PaletteId = 'ozguvenis' | 'okyanus' | 'orman' | 'gunbatimi' | 'grafit';
export interface UiPrefs { theme: ThemePref; palette: PaletteId }
export interface PaletteInfo { id: PaletteId; label: string; swatch: string }

/** swatch: Ayarlar'daki önizleme rengi (açık temadaki ana renk). */
export const PALETTES: readonly PaletteInfo[] = [
  { id: 'ozguvenis', label: 'Özgüveniş', swatch: '#85713b' },
  { id: 'okyanus', label: 'Okyanus', swatch: '#1f6fd1' },
  { id: 'orman', label: 'Orman', swatch: '#1b7f52' },
  { id: 'gunbatimi', label: 'Günbatımı', swatch: '#c8502a' },
  { id: 'grafit', label: 'Grafit', swatch: '#3f4148' },
];

export const DEFAULT_PREFS: UiPrefs = { theme: 'auto', palette: 'ozguvenis' };

const PALETTE_IDS = new Set<string>(PALETTES.map((p) => p.id));
const THEME_PREFS = new Set<string>(['light', 'dark', 'auto']);

/** Eski "vurgu rengi" tercihi (duvar kâğıtlı cam arayüz) en yakın palete taşınır. */
const ACCENT_TO_PALETTE: Record<string, PaletteId> = {
  mor: 'okyanus', yesil: 'orman', turuncu: 'gunbatimi', pembe: 'gunbatimi', grafit: 'grafit', altin: 'ozguvenis',
};

export const isPalette = (v: unknown): v is PaletteId => typeof v === 'string' && PALETTE_IDS.has(v);

/**
 * Sunucudan / önbellekten gelen (eski veya bozuk olabilecek) tercihi geçerli UiPrefs'e çevirir.
 * Eski kayıtta palet yoksa vurgu rengi eşlenir; eski varsayılan "mavi" yeni varsayılana (Özgüveniş) döner.
 */
export function normalizePrefs(raw: unknown): UiPrefs {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const theme = typeof src.theme === 'string' && THEME_PREFS.has(src.theme) ? (src.theme as ThemePref) : DEFAULT_PREFS.theme;
  let palette: PaletteId = DEFAULT_PREFS.palette;
  if (isPalette(src.palette)) palette = src.palette;
  else if (typeof src.accent === 'string') palette = ACCENT_TO_PALETTE[src.accent] ?? DEFAULT_PREFS.palette;
  return { theme, palette };
}

/**
 * Geçerli tercihin üstüne bir değişikliği uygular. Değişiklik eski biçimdeyse (palet yok, vurgu rengi var — ör. sunucudaki
 * eski kayıt) önce kendi başına çevrilir; yoksa yerel paletin varlığı vurgu rengi eşlemesini hiç çalıştırmazdı.
 */
export function mergePrefs(current: UiPrefs, change: Record<string, unknown>): UiPrefs {
  const legacy = !('palette' in change) && 'accent' in change;
  const incoming = legacy ? { ...change, palette: normalizePrefs(change).palette } : change;
  return normalizePrefs({ ...current, ...incoming });
}

/** "Otomatik" tercihini sistemin açık/koyu ayarına göre çözer. */
export const resolveTheme = (pref: ThemePref, systemPrefersLight: boolean): Theme =>
  pref === 'auto' ? (systemPrefersLight ? 'light' : 'dark') : pref;

/** Tarayıcı/durum çubuğu rengi (meta theme-color): B2B portalının zemin tonları. */
export const chromeColor = (theme: Theme): string => (theme === 'dark' ? '#141311' : '#f7f7f7');
