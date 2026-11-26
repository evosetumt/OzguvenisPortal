import { describe, expect, it } from 'vitest';
import { customerTypeLabel, dateRangeParams, nextSort, toDateInput } from './accounts';

describe('cari hesap yardımcıları', () => {
  it('maps Netsis CARI_TIP codes to Turkish labels and keeps unknown codes', () => {
    expect(customerTypeLabel('A')).toBe('Alıcı');
    expect(customerTypeLabel('s')).toBe('Satıcı');
    expect(customerTypeLabel('Z')).toBe('Z');
    expect(customerTypeLabel(null)).toBe('Tanımsız');
  });

  it('toggles direction on the same column and picks a sensible default for a new one', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'balance')).toEqual({ key: 'balance', dir: 'desc' });
    expect(nextSort({ key: 'balance', dir: 'desc' }, 'code')).toEqual({ key: 'code', dir: 'asc' });
  });

  it('builds an inclusive start and an exclusive next-day end from date inputs', () => {
    const r = dateRangeParams('2026-01-01', '2026-01-31');
    expect(toDateInput(new Date(r.from!))).toBe('2026-01-01');
    expect(toDateInput(new Date(r.to!))).toBe('2026-02-01');
    expect(dateRangeParams('', '')).toEqual({});
    expect(dateRangeParams('2026-03-05', '').to).toBeUndefined();
  });
});
