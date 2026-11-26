import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarSync, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatTime, localKey, todayKey } from '../lib/format';
import { safeAppPath } from '../lib/safe-path';
import type { CalendarItem, UserRef } from '../lib/types';
import { Modal } from '../components/Modal';
import { AttachmentPicker } from '../components/AttachmentPicker';
import type { FileRef } from '../lib/types-workflow';
import { useRequired } from '../lib/required';
import { deviceCalendarEnabled, deviceCalendarLastSync, deviceCalendarSupported, disableDeviceCalendar, enableDeviceCalendar, syncDeviceCalendar } from '../lib/device-calendar';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const VIS_LABEL = { private: 'Yalnızca davetliler', department: 'Departman', company: 'Tüm şirket' } as const;

/** Ayın görünen ızgarası: pazartesiden başlayan 6 hafta. */
function gridDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Öğenin görüneceği gün anahtarları (çok günlü etkinlikler her güne yayılır). */
function itemDays(it: CalendarItem): string[] {
  // Görev ve modül tarihleri (UTC gece yarısı saklanan tam gün) tek güne düşer.
  if (it.kind !== 'event' && it.allDay) return [dateKey(it.start)];
  const s = new Date(it.start), e = new Date(it.end);
  const out: string[] = [];
  for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= e && out.length < 42; d.setDate(d.getDate() + 1)) out.push(localKey(d));
  return out.length ? out : [localKey(s)];
}

export function CalendarPage() {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [editing, setEditing] = useState<{ item?: CalendarItem; date?: string } | null>(null);
  const [phoneCal, setPhoneCal] = useState(false);
  const days = useMemo(() => gridDays(month), [month]);
  const from = days[0]!, to = new Date(days[41]!.getFullYear(), days[41]!.getMonth(), days[41]!.getDate() + 1);
  const { data: items, error, reload } = useApi<CalendarItem[]>(`/calendar?from=${from.toISOString()}&to=${to.toISOString()}`);
  const { data: users } = useApi<UserRef[]>('/users/directory');
  // Portalda etkinlik eklenip değişince cihaz takvimi de güncellensin (eşitleme kapalıysa hiçbir şey yapmaz)
  useEffect(() => { if (items) void syncDeviceCalendar().catch(() => undefined); }, [items]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) for (const k of itemDays(it)) m.set(k, [...(m.get(k) ?? []), it]);
    return m;
  }, [items]);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = todayKey();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Takvim</h1>
        </div>
        <span className="cal-head-actions">
          {deviceCalendarSupported() && <button className="btn" onClick={() => setPhoneCal(true)}><CalendarSync size={16} /> Telefon takvimi</button>}
          <button className="btn primary" onClick={() => setEditing({ date: today })}><Plus size={16} /> Etkinlik</button>
        </span>
      </div>
      {phoneCal && <PhoneCalendarModal onClose={() => setPhoneCal(false)} />}

      <div className="glass toolbar">
        <button className="icon-btn" title="Önceki ay" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <b className="month-title">{month.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</b>
        <button className="icon-btn" title="Sonraki ay" onClick={() => shift(1)}><ChevronRight size={18} /></button>
        <button className="btn ghost sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Bugün</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="glass cal">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {days.map((d) => {
          const k = localKey(d);
          const list = byDay.get(k) ?? [];
          return (
            <div key={k} className={'cal-day' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (k === today ? ' today' : '')}
              onClick={(e) => e.target === e.currentTarget && setEditing({ date: k })}>
              <span className="cal-num" onClick={() => setEditing({ date: k })}>{d.getDate()}</span>
              {list.slice(0, 4).map((it) => (
                <button key={it.key} className={'cal-item ' + it.kind + (it.done ? ' done' : '')}
                  style={it.color ? { borderLeftColor: it.color } : undefined}
                  title={it.title}
                  onClick={() => (it.kind === 'event' ? setEditing({ item: it }) : nav(safeAppPath(it.link) ?? `/tasks?id=${it.id}`))}>
                  {it.kind === 'event' && !it.allDay && <small>{formatTime(it.start)} </small>}
                  {it.title}
                </button>
              ))}
              {list.length > 4 && <small className="more">+{list.length - 4} daha</small>}
            </div>
          );
        })}
      </div>

      {editing && (
        <EventForm item={editing.item} date={editing.date} users={users ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
    </>
  );
}

function EventForm({ item, date, users, onClose, onSaved }: {
  item?: CalendarItem; date?: string; users: UserRef[]; onClose(): void; onSaved(): void;
}) {
  const { me } = useAuth();
  const ro = !!item && !item.canEdit;
  const s = item ? new Date(item.start) : null, e = item ? new Date(item.end) : null;
  const [f, setF] = useState({
    title: item?.title ?? '',
    date: s ? localKey(s) : date!,
    endDate: e ? localKey(e) : date!,
    start: s ? formatTime(item!.start) : '09:00',
    end: e ? formatTime(item!.end) : '10:00',
    allDay: item?.allDay ?? false,
    location: item?.location ?? '',
    description: item?.description ?? '',
    visibility: item?.visibility ?? 'private',
    attendeeIds: new Set(item?.attendees?.map((a) => a.id) ?? []),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FileRef[]>(item?.files ?? []);
  const req = useRequired('event');

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const startsAt = new Date(`${f.date}T${f.allDay ? '00:00' : f.start}`);
    const endsAt = new Date(`${f.endDate}T${f.allDay ? '23:59' : f.end}`);
    if (endsAt < startsAt) { setError('Bitiş, başlangıçtan önce olamaz'); return; }
    const missing = req.check({ description: f.description, location: f.location, attendees: f.attendeeIds, attachments: files });
    if (missing) { setError(missing); return; }
    setBusy(true); setError('');
    const body = {
      title: f.title, allDay: f.allDay, location: f.location, description: f.description, visibility: f.visibility,
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), attendeeIds: [...f.attendeeIds],
      attachmentIds: files.map((x) => x.id),
    };
    try {
      await api(item ? `/calendar/${item.id}` : '/calendar', json(item ? 'PATCH' : 'POST', body));
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Kaydedilemedi'); setBusy(false); }
  };

  const remove = async () => {
    if (!item || !window.confirm('Etkinlik silinsin mi?')) return;
    try { await api(`/calendar/${item.id}`, json('DELETE')); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Silinemedi'); }
  };

  const toggle = (id: number) => {
    const n = new Set(f.attendeeIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setF({ ...f, attendeeIds: n });
  };

  return (
    <Modal title={item ? (ro ? 'Etkinlik' : 'Etkinliği düzenle') : 'Yeni etkinlik'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <fieldset disabled={ro}>
          <label>Başlık<input autoFocus required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> Tüm gün</label>
          <div className="row">
            <label>Başlangıç<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} /></label>
            {!f.allDay && <label>Saat<input type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>}
          </div>
          <div className="row">
            <label>Bitiş<input type="date" required value={f.endDate} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
            {!f.allDay && <label>Saat<input type="time" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>}
          </div>
          <div className="row">
            <label>Yer{req.has('location') && <i className="req" aria-hidden="true">*</i>}<input maxLength={200} required={req.has('location')} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
            <label>Görünürlük
              <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as typeof f.visibility })}>
                {Object.entries(VIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>Açıklama{req.has('description') && <i className="req" aria-hidden="true">*</i>}<textarea rows={2} maxLength={2000} required={req.has('description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="field">
            <span>Davetliler{req.has('attendees') && <i className="req" aria-hidden="true">*</i>}</span>
            <div className="chips">
              {users.filter((u) => u.id !== me!.id).map((u) => (
                <button type="button" key={u.id} className={'chip' + (f.attendeeIds.has(u.id) ? ' on' : '')} onClick={() => toggle(u.id)}>{u.fullName}</button>
              ))}
            </div>
          </div>
        </fieldset>
        <div className="field">
          <span>Ekler{req.has('attachments') && <i className="req" aria-hidden="true">*</i>}</span>
          <AttachmentPicker files={files} canAdd={!ro} onAdd={(add) => setFiles((cur) => [...cur, ...add])}
            onRemove={ro ? undefined : (x) => setFiles((cur) => cur.filter((y) => y.id !== x.id))} />
        </div>
        {item?.owner && <small>Oluşturan: {item.owner.fullName}</small>}
        {error && <p className="error" role="alert">{error}</p>}
        {!ro && (
          <div className="actions">
            {item && <button type="button" className="btn danger push-right" onClick={remove}>Sil</button>}
            <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
            <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Mobil uygulama: portal takvimini telefonun takvim uygulamasına ("Özgüveniş" takvimi) eşitleme ayarı. */
function PhoneCalendarModal({ onClose }: { onClose(): void }) {
  const [on, setOn] = useState(deviceCalendarEnabled());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const last = deviceCalendarLastSync();
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'İşlem başarısız' }); }
    setOn(deviceCalendarEnabled()); setBusy(false);
  };
  return (
    <Modal title="Telefon takvimi" onClose={onClose}>
      <div className="form">
        <p>Portal takvimindeki etkinlikler, toplantılar ve görev bitiş tarihleri telefonunuzun takvim uygulamasında <b>Özgüveniş</b> adlı ayrı bir takvimde görünür (son 30 gün ve gelecek 6 ay). Uygulama her açıldığında güncellenir. Diğer takvimlerinize dokunulmaz.</p>
        {on && <p><small>Durum: açık{last ? ` · son eşitleme ${new Date(last).toLocaleString('tr-TR')}` : ''}</small></p>}
        {msg && <p className={msg.ok ? '' : 'error'} role="status">{msg.text}</p>}
        <div className="actions">
          {on ? <>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await disableDeviceCalendar(); return 'Kapatıldı; Özgüveniş takvimi telefondan kaldırıldı.'; })}>Kapat</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => `Eşitlendi (${await syncDeviceCalendar(true)} kayıt).`)}>{busy ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button>
          </> : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => `Açıldı; ${await enableDeviceCalendar()} kayıt telefona eklendi.`)}>{busy ? 'Ayarlanıyor…' : 'Telefon takvimine ekle'}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
