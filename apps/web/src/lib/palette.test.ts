import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PALETTES, chromeColor, isPalette, mergePrefs, normalizePrefs, resolveTheme } from './palette';

describe('normalizePrefs', () => {
  it('returns defaults for missing or malformed input', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs('dark')).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ theme: 'neon', palette: 'unknown' })).toEqual(DEFAULT_PREFS);
  });

  it('keeps a valid theme and palette', () => {
    expect(normalizePrefs({ theme: 'dark', palette: 'orman' })).toEqual({ theme: 'dark', palette: 'orman' });
  });

  it('migrates the legacy accent color to the closest palette', () => {
    expect(normalizePrefs({ theme: 'light', wallpaper: 'kutup', accent: 'yesil' })).toEqual({ theme: 'light', palette: 'orman' });
    expect(normalizePrefs({ accent: 'turuncu' }).palette).toBe('gunbatimi');
    expect(normalizePrefs({ accent: 'grafit' }).palette).toBe('grafit');
    expect(normalizePrefs({ accent: 'altin' }).palette).toBe('ozguvenis');
  });

  it('moves the old default blue accent to the new brand palette', () => {
    expect(normalizePrefs({ theme: 'auto', accent: 'mavi' }).palette).toBe('ozguvenis');
  });

  it('prefers an explicit palette over a legacy accent', () => {
    expect(normalizePrefs({ palette: 'okyanus', accent: 'yesil' }).palette).toBe('okyanus');
  });

  it('drops unknown fields such as the removed wallpaper', () => {
    expect(Object.keys(normalizePrefs({ theme: 'dark', wallpaper: 'kor', extra: 1 })).sort()).toEqual(['palette', 'theme']);
  });
});

describe('mergePrefs', () => {
  it('migrates a legacy server record even when a local palette exists', () => {
    const local = { theme: 'auto' as const, palette: 'ozguvenis' as const };
    expect(mergePrefs(local, { theme: 'dark', wallpaper: 'duz', accent: 'mor' })).toEqual({ theme: 'dark', palette: 'okyanus' });
  });

  it('keeps the local palette when only the mode changes', () => {
    expect(mergePrefs({ theme: 'auto', palette: 'orman' }, { theme: 'light' })).toEqual({ theme: 'light', palette: 'orman' });
  });

  it('applies an explicit palette change', () => {
    expect(mergePrefs({ theme: 'dark', palette: 'orman' }, { palette: 'grafit' })).toEqual({ theme: 'dark', palette: 'grafit' });
  });
});

describe('resolveTheme', () => {
  it('follows the system setting only in auto mode', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});

describe('palettes', () => {
  it('have unique ids recognised by isPalette', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isPalette(id)).toBe(true);
    expect(isPalette('mavi')).toBe(false);
  });

  it('uses the B2B background colors for the browser chrome', () => {
    expect(chromeColor('light')).toBe('#f7f7f7');
    expect(chromeColor('dark')).toBe('#141311');
  });
});
