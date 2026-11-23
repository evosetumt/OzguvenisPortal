import { describe, expect, it } from 'vitest';
import { isShareCancel, safeFileName } from './share';

describe('safeFileName', () => {
  it('replaces characters that file systems reject', () => {
    expect(safeFileName('GIB2026/000123: Fatura?.pdf')).toBe('GIB2026-000123- Fatura-.pdf');
  });

  it('collapses whitespace and trims dots, dashes and spaces at the edges', () => {
    expect(safeFileName('  ..Özgüveniş   e-Arşiv  ')).toBe('Özgüveniş e-Arşiv');
  });

  it('falls back when nothing usable is left', () => {
    expect(safeFileName('///')).toBe('belge');
    expect(safeFileName('', 'fatura')).toBe('fatura');
  });

  it('limits the length', () => {
    expect(safeFileName('a'.repeat(300))).toHaveLength(120);
  });
});

describe('isShareCancel', () => {
  it('treats a user dismissing the share sheet as a cancel', () => {
    expect(isShareCancel(new DOMException('dismissed', 'AbortError'))).toBe(true);
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
  });

  it('does not hide real failures', () => {
    expect(isShareCancel(new Error('Permission denied'))).toBe(false);
    expect(isShareCancel(undefined)).toBe(false);
  });
});
