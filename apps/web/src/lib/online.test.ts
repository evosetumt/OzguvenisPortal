import { describe, expect, it } from 'vitest';
import { applyChange, fromSnapshot, lastSeenLabel, onlineFirst, presenceDot } from './online';

describe('online presence', () => {
  it('builds state from the server snapshot', () => {
    const map = fromSnapshot({ online: [1, 3], lastSeen: { '1': null, '2': '2026-11-23T08:00:00.000Z' } });
    expect(map.get(1)).toEqual({ online: true, lastSeenAt: null });
    expect(map.get(2)).toEqual({ online: false, lastSeenAt: '2026-11-23T08:00:00.000Z' });
    expect(map.get(3)?.online).toBe(true);
  });

  it('keeps the previous last-seen time when a user comes online', () => {
    const before = fromSnapshot({ online: [], lastSeen: { '5': '2026-11-22T10:00:00.000Z' } });
    const after = applyChange(before, { userId: 5, online: true });
    expect(after.get(5)).toEqual({ online: true, lastSeenAt: '2026-11-22T10:00:00.000Z' });
    expect(before.get(5)?.online).toBe(false); // önceki depo değişmez
  });

  it('formats last seen relative to now', () => {
    const now = new Date(2026, 10, 23, 15, 0);
    expect(lastSeenLabel({ online: true, lastSeenAt: null }, now)).toBe('çevrimiçi');
    expect(lastSeenLabel({ online: false, lastSeenAt: null }, now)).toBe('çevrimdışı');
    expect(lastSeenLabel({ online: false, lastSeenAt: new Date(2026, 10, 23, 9, 5).toISOString() }, now)).toBe('son görülme bugün 09:05');
    expect(lastSeenLabel({ online: false, lastSeenAt: new Date(2026, 10, 22, 21, 30).toISOString() }, now)).toBe('son görülme dün 21:30');
    expect(lastSeenLabel({ online: false, lastSeenAt: new Date(2026, 10, 12, 14, 0).toISOString() }, now)).toMatch(/^son görülme 12 Kas 14:00$/);
    expect(lastSeenLabel(undefined, now)).toBe('');
  });

  it('colours the dot by the chosen status only while the user is connected', () => {
    const on = { online: true, lastSeenAt: null };
    const off = { online: false, lastSeenAt: '2026-11-23T08:00:00.000Z' };
    expect(presenceDot(on, 'meeting')).toBe('meeting');
    expect(presenceDot(on, 'focus')).toBe('focus');
    expect(presenceDot(on, undefined)).toBe('online');
    expect(presenceDot(on, '')).toBe('online');
    expect(presenceDot(off, 'meeting')).toBeUndefined();
    expect(presenceDot(undefined, 'online')).toBeUndefined();
  });

  it('lists online people first and keeps the original order within each group', () => {
    const people = [{ id: 1, n: 'Ali' }, { id: 2, n: 'Berk' }, { id: 3, n: 'Cem' }, { id: 4, n: 'Deniz' }];
    expect(onlineFirst(people, new Set([3, 2])).map((p) => p.id)).toEqual([2, 3, 1, 4]);
    expect(onlineFirst(people, new Set()).map((p) => p.id)).toEqual([1, 2, 3, 4]);
    expect(people.map((p) => p.id)).toEqual([1, 2, 3, 4]); // girdi değişmez
  });
});
