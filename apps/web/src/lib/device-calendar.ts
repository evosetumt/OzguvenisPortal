import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import { api } from './api';
import { storeGet, storeSet } from './storage';
import type { CalendarItem } from './types';

/**
 * Cihaz takvimi entegrasyonu (yalnızca Android/iOS uygulaması; @ebarooni/capacitor-calendar).
 * Portal takvimi (etkinlikler, toplantılar, görev bitiş tarihleri...) cihazda ayrı bir "Özgüveniş" takvimine tek yönlü yazılır.
 * Yalnızca bu takvimdeki, bu uygulamanın oluşturduğu kayıtlara dokunulur; kullanıcının diğer takvimleri okunmaz/değişmez.
 * Kapatınca "Özgüveniş" takvimi tamamen silinir.
 */

const KEY = 'ozg-device-cal';
const CAL_TITLE = 'Özgüveniş';
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

interface State {
  calendarId: string;
  /** portal kaydı anahtarı → cihaz etkinliği + içerik özeti (değişmediyse yeniden yazılmaz) */
  events: Record<string, { id: string; sig: string }>;
  lastSync?: string;
}

export const deviceCalendarSupported = () => Capacitor.isNativePlatform();

const load = (): State | null => {
  try { const s = storeGet(KEY); return s ? (JSON.parse(s) as State) : null; } catch { return null; }
};
const save = (s: State | null) => storeSet(KEY, s ? JSON.stringify(s) : null);

// Android'de yerel (hesapsız) takvim için hesap adı zorunlu; iOS bunları yok sayar.
const createCal = async () =>
  (await CapacitorCalendar.createCalendar({ title: CAL_TITLE, color: '#C9A227', accountName: CAL_TITLE, ownerAccount: CAL_TITLE })).id;

export const deviceCalendarEnabled = () => deviceCalendarSupported() && !!load();
export const deviceCalendarLastSync = () => load()?.lastSync ?? null;

/** İzin ister, "Özgüveniş" takvimini bulur ya da oluşturur ve ilk eşitlemeyi yapar. */
export async function enableDeviceCalendar(): Promise<number> {
  if (!deviceCalendarSupported()) throw new Error('Cihaz takvimi yalnızca mobil uygulamada kullanılabilir');
  const { result } = await CapacitorCalendar.requestFullCalendarAccess();
  if (result !== 'granted') throw new Error('Takvim izni verilmedi. Telefon ayarlarından Özgüveniş uygulamasına takvim izni verin.');

  // Önceki kurulumdan kalan "Özgüveniş" takvimleri (içerikleri bilinmiyor) silinir, temiz başlanır.
  const { result: cals } = await CapacitorCalendar.listCalendars();
  for (const c of cals.filter((x) => x.title === CAL_TITLE)) {
    try { await CapacitorCalendar.deleteCalendar({ id: c.id }); } catch { /* yoksay */ }
  }
  save({ calendarId: await createCal(), events: {} });
  return syncDeviceCalendar(true);
}

/** Eşitlemeyi kapatır ve "Özgüveniş" takvimini cihazdan siler. */
export async function disableDeviceCalendar() {
  // Süren eşitleme bitince kendi save() çağrısıyla özelliği yeniden açmasın: önce onu bekle.
  await running?.catch(() => undefined);
  const s = load();
  save(null);
  if (s && deviceCalendarSupported()) {
    try { await CapacitorCalendar.deleteCalendar({ id: s.calendarId }); } catch { /* zaten silinmiş */ }
  }
}

const sigOf = (it: CalendarItem) => [it.title, it.start, it.end, it.allDay, it.location ?? '', it.description ?? '', it.done ?? false].join('|');

const LABEL: Record<string, string> = { task: 'Görev', meeting: 'Toplantı', tracking: 'Süre takibi', shipment: 'Sevkiyat' };

function eventFields(it: CalendarItem) {
  const start = new Date(it.start);
  let end = new Date(it.end || it.start);
  if (it.allDay) {
    // Portal tüm gün bitişini gün sonu/ertesi gün gece yarısı verebilir; eklenti bitişi "dahil olan son gün" bekler.
    if (end > start && end.getHours() === 0 && end.getMinutes() === 0) end = new Date(end.getTime() - 1);
    if (end < start) end = start;
  } else if (end <= start) {
    end = new Date(start.getTime() + 30 * 60_000);
  }
  const kind = LABEL[it.kind];
  return {
    title: (it.done ? '✓ ' : '') + (kind && it.kind !== 'event' ? `${kind}: ` : '') + it.title,
    startDate: start.getTime(),
    endDate: end.getTime(),
    isAllDay: it.allDay,
    location: it.location ?? undefined,
    description: [it.description, 'Özgüveniş portalından eşitlendi'].filter(Boolean).join('\n\n'),
  };
}

let running: Promise<number> | null = null;

/** Portal takvimini (son 30 gün – gelecek 180 gün) cihaz takvimine yazar. Döner: değişen kayıt sayısı. */
export function syncDeviceCalendar(force = false): Promise<number> {
  if (!deviceCalendarEnabled()) return Promise.resolve(0);
  if (running) return running;
  running = doSync(force).finally(() => { running = null; });
  return running;
}

async function doSync(force: boolean): Promise<number> {
  const s = load()!;
  // Kullanıcı takvimi telefondan silmişse yeniden oluştur
  const { result: cals } = await CapacitorCalendar.listCalendars();
  if (!cals.some((c) => c.id === s.calendarId)) {
    s.calendarId = await createCal(); s.events = {};
  }

  const now = Date.now();
  const from = new Date(now - PAST_DAYS * 86_400_000), to = new Date(now + FUTURE_DAYS * 86_400_000);
  const items = await api<CalendarItem[]>(`/calendar?from=${from.toISOString()}&to=${to.toISOString()}`);

  let changed = 0;
  const next: State['events'] = {};
  for (const it of items) {
    const sig = sigOf(it);
    const prev = s.events[it.key];
    try {
      if (prev && prev.sig === sig && !force) { next[it.key] = prev; continue; }
      if (prev) {
        await CapacitorCalendar.modifyEvent({ id: prev.id, calendarId: s.calendarId, ...eventFields(it) });
        next[it.key] = { id: prev.id, sig };
      } else {
        const { id } = await CapacitorCalendar.createEvent({ calendarId: s.calendarId, commit: true, ...eventFields(it) });
        if (id) next[it.key] = { id, sig };
      }
      changed++;
    } catch {
      // Etkinlik telefondan elle silinmiş olabilir: yeniden oluşturmayı dene.
      // Eski kayıt hâlâ duruyorsa çift olmasın diye önce silinir (yoksa hata yok sayılır).
      if (prev) {
        try { await CapacitorCalendar.deleteEventsById({ ids: [prev.id], commit: true }); } catch { /* zaten yok */ }
      }
      try {
        const { id } = await CapacitorCalendar.createEvent({ calendarId: s.calendarId, commit: true, ...eventFields(it) });
        if (id) { next[it.key] = { id, sig }; changed++; }
      } catch { /* bu kayıt atlanır, bir sonraki eşitlemede tekrar denenir */ }
    }
  }

  // Portalda artık olmayan (silinen ya da aralık dışına çıkan) kayıtlar
  const gone = Object.entries(s.events).filter(([k]) => !next[k]);
  if (gone.length) {
    try {
      await CapacitorCalendar.deleteEventsById({ ids: gone.map(([, v]) => v.id), commit: true });
      changed += gone.length;
    } catch {
      // Silinemeyenler unutulursa telefonda sonsuza dek kalır: kayıtta tut, sonraki eşitlemede tekrar denensin.
      for (const [k, v] of gone) next[k] = v;
    }
  }

  // Eşitleme sürerken kapatıldıysa durumu geri yazma (özellik kendiliğinden yeniden açılmasın).
  if (!load()) return changed;
  save({ calendarId: s.calendarId, events: next, lastSync: new Date().toISOString() });
  return changed;
}
