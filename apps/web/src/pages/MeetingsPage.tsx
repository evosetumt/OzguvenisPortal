import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, NotebookPen, Plus, Trash2, Video } from 'lucide-react';
import { api } from '../lib/api';
import { useCalls } from '../lib/calls';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { formatTime, localKey } from '../lib/format';
import type { UserRef } from '../lib/types';
import type { Meeting } from '../lib/types-chat';
import { Modal } from '../components/Modal';
import { UserPicker } from '../components/chat/UserPicker';
import { MeetingSidePanel } from '../components/chat/MeetingSidePanel';
import '../styles/chat.css';

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long' });

export function MeetingsPage() {
  const [params, setParams] = useSearchParams();
  const focusId = Number(params.get('id')) || null;
  const autoJoin = params.get('join') === '1';
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data, error, reload } = useApi<Meeting[]>(`/meetings?when=${when}`);
  const { data: focused } = useApi<Meeting>(focusId ? `/meetings/${focusId}` : null);
  const [creating, setCreating] = useState(false);
  const calls = useCalls();
  const [notesFor, setNotesFor] = useState<Meeting | null>(null);
  const [joinError, setJoinError] = useState('');
  const joinedOnce = useRef(false);

  const join = async (m: Meeting) => {
    setJoinError('');
    try {
      await calls.joinMeeting(m.id);
    } catch (e) {
      setJoinError(`${m.title}: ${e instanceof Error ? e.message : 'Katılınamadı'}`);
    }
  };

  // ?join=1 ile gelindiyse (eski sohbet bağlantıları, takvim) doğrudan katıl.
  useEffect(() => {
    if (autoJoin && focused && !joinedOnce.current) {
      joinedOnce.current = true;
      void join(focused);
      setParams({ id: String(focused.id) }, { replace: true });
    }
  }, [autoJoin, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async (m: Meeting) => {
    if (!window.confirm(`"${m.title}" iptal edilsin mi? Katılımcılara bildirim gider.`)) return;
    await api(`/meetings/${m.id}`, json('DELETE'));
    void reload();
  };

  const list = data ?? [];
  // Odaklanan toplantı listede yoksa (ör. geçmiş) en üstte gösterilir.
  const shown = focused && !list.some((m) => m.id === focused.id) ? [focused, ...list] : list;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Toplantılar</h1>
          <p className="sub">Görüntülü toplantılar takvime de yansır</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Toplantı planla</button>
      </div>
      <div className="toolbar glass">
        <div className="seg">
          <button className={when === 'upcoming' ? 'on' : ''} onClick={() => setWhen('upcoming')}>Yaklaşan</button>
          <button className={when === 'past' ? 'on' : ''} onClick={() => setWhen('past')}>Geçmiş</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {joinError && <p className="error" role="alert">{joinError}</p>}
      {data && shown.length === 0 && <p className="empty">{when === 'upcoming' ? 'Yaklaşan toplantı yok.' : 'Geçmiş toplantı yok.'}</p>}
      <div className="meeting-list">
        {shown.map((m) => (
          <article key={m.id} className={'glass meeting-card' + (m.id === focusId ? ' focus' : '')}>
            <div className="meeting-when">
              <CalendarClock size={18} />
              <span><b>{dayLabel(m.startsAt)}</b><small>{formatTime(m.startsAt)} – {formatTime(m.endsAt)}</small></span>
            </div>
            <div className="meeting-info">
              <h3>{m.title}</h3>
              <small>Düzenleyen: {m.organizer.fullName}{m.participants.length > 0 && ` · ${m.participants.map((p) => p.fullName).join(', ')}`}</small>
            </div>
            <div className="meeting-actions">
              {m.joinable && <button className="btn primary sm" onClick={() => join(m)}><Video size={14} /> Katıl</button>}
              <button className="icon-btn" title={m.canAssignTasks ? 'Notlarım ve görevler' : 'Notlarım ve toplantı görevleri'} onClick={() => setNotesFor(m)}><NotebookPen size={16} /></button>
              {m.canEdit && new Date(m.endsAt) > new Date() && (
                <button className="icon-btn" title="İptal et" onClick={() => cancel(m)}><Trash2 size={16} /></button>
              )}
            </div>
          </article>
        ))}
      </div>

      {creating && <MeetingForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setWhen('upcoming'); void reload(); }} />}
      {notesFor && (
        <Modal title={notesFor.title} onClose={() => setNotesFor(null)}>
          <MeetingSidePanel meetingId={notesFor.id} canAssignTasks={notesFor.canAssignTasks} />
        </Modal>
      )}
    </>
  );
}

function MeetingForm({ onClose, onSaved }: { onClose(): void; onSaved(): void }) {
  const { me } = useAuth();
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const now = new Date();
  const start = new Date(now.getTime() + (30 - (now.getMinutes() % 30)) * 60_000);
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const [f, setF] = useState({ title: '', date: localKey(start), start: hhmm(start), end: hhmm(new Date(start.getTime() + 3600_000)) });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const startsAt = new Date(`${f.date}T${f.start}`);
    const endsAt = new Date(`${f.date}T${f.end}`);
    if (endsAt <= startsAt) { setError('Bitiş saati başlangıçtan sonra olmalı'); return; }
    setBusy(true);
    try {
      await api('/meetings', json('POST', { title: f.title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), participantIds: [...selected] }));
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Kaydedilemedi'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Toplantı planla" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Başlık<input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
        <div className="row">
          <label>Tarih<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label>Başlangıç<input type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label>Bitiş<input type="time" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
        <div className="field">Katılımcılar ({selected.size})
          <UserPicker users={users ?? []} selected={selected} onToggle={toggle} exclude={[me!.id]} />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>Planla</button>
        </div>
      </form>
    </Modal>
  );
}
