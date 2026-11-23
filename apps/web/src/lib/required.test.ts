import { describe, expect, it } from 'vitest';
import { isEmptyValue, missingRequired, type RequiredFieldsData } from './required';

const data: RequiredFieldsData = {
  catalog: [{ form: 'task', label: 'Görev', fields: [
    { key: 'description', label: 'Açıklama' }, { key: 'dueDate', label: 'Bitiş tarihi' }, { key: 'attachments', label: 'Ek' },
  ] }],
  required: { task: ['description', 'attachments'] },
};

describe('required fields', () => {
  it('treats blank strings, empty arrays and empty sets as empty', () => {
    expect(isEmptyValue('  ')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(new Set())).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue('x')).toBe(false);
  });

  it('lists only required fields that are empty', () => {
    expect(missingRequired(data, 'task', { description: '', dueDate: '', attachments: [] })).toEqual(['Açıklama', 'Ek']);
    expect(missingRequired(data, 'task', { description: 'ok', attachments: [1] })).toEqual([]);
  });

  it('returns nothing for unknown forms or missing settings', () => {
    expect(missingRequired(data, 'event', {})).toEqual([]);
    expect(missingRequired(undefined, 'task', {})).toEqual([]);
  });
});
