import { describe, expect, it } from 'vitest';
import { applyChange, fromSnapshot, lastSeenLabel } from './online';

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
});
