import { useEffect, useState } from 'react';
import { api } from './api';

/** Kişi rehberi önbelleği: profil fotoğrafı ve durum her yerde kimlikten bulunur (tek istek, tüm bileşenler paylaşır). */
export interface Person { id: number; fullName: string; avatarUrl: string | null; departmentId: number | null; title: string | null; presence: string }

let people = new Map<number, Person>();
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function loadPeople(force = false) {
  if (loading && !force) return loading;
  loading = api<Person[]>('/users/directory')
    .then((list) => { people = new Map(list.map((p) => [p.id, p])); notify(); })
    .catch(() => { loading = null; });
  return loading;
}

/** Kendi profilimi değiştirince (fotoğraf, durum) önbelleği hemen güncelle. */
export function patchPerson(id: number, change: Partial<Person>) {
  const p = people.get(id);
  if (!p) return;
  people = new Map(people).set(id, { ...p, ...change });
  notify();
}

export function usePeople() {
  const [, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((v) => v + 1);
    subs.add(f);
    void loadPeople();
    return () => { subs.delete(f); };
  }, []);
  return people;
}

export const PRESENCE: Record<string, { label: string; cls: string }> = {
  online: { label: 'Çevrimiçi', cls: 'ok' },
  focus: { label: 'Odakta', cls: 'focus' },
  meeting: { label: 'Toplantıda', cls: 'warn' },
  away: { label: 'Uzakta', cls: 'off' },
};
