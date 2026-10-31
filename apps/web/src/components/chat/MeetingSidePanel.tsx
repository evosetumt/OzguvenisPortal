import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Lock, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { formatTime } from '../../lib/format';
import { PRIORITY_LABEL, type Priority, type UserRef } from '../../lib/types';
import type { MeetingTask } from '../../lib/types-chat';
import type { AttendanceSession } from '../../lib/types-call';

type Tab = 'note' | 'tasks' | 'attendance';

/**
 * Toplantı yan paneli: kişiye özel not (otomatik kaydedilir, yalnızca sahibi görür), toplantıda açılan görevler
 * ve katılım geçmişi (kim ne zaman girip çıktı).
 * Yöneticiler (canAssignTasks) istedikleri kişiye görev açar. Toplantı odasında ve geçmiş toplantı kartında kullanılır.
 */
export function MeetingSidePanel({ meetingId, canAssignTasks, dark }: { meetingId: number; canAssignTasks: boolean; dark?: boolean }) {
  const [tab, setTab] = useState<Tab>('note');
  return (
    <div className={'meeting-side' + (dark ? ' dark' : '')}>
      <div className="seg">
        <button className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>Notlarım</button>
        <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>Görevler</button>
        <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}>Katılım</button>
      </div>
      {tab === 'note' && <MeetingNote meetingId={meetingId} />}
      {tab === 'tasks' && <MeetingTasks meetingId={meetingId} canAssign={canAssignTasks} newTab={dark} />}
      {tab === 'attendance' && <Attendance meetingId={meetingId} />}
    </div>
  );
}

const SAVE_DELAY_MS = 800;

function MeetingNote({ meetingId }: { meetingId: number }) {
  const { data, error } = useApi<{ body: string; updatedAt: string | null }>(`/meetings/${meetingId}/note`);
  const [body, setBody] = useState<string | null>(null);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; at?: string; msg?: string }>({ kind: 'idle' });
  const timer = useRef<number>();
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (data && body === null) {
      setBody(data.body);
      if (data.updatedAt) setState({ kind: 'saved', at: data.updatedAt });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (text: string) => {
    pending.current = null;
    setState({ kind: 'saving' });
    try {
      const r = await api<{ updatedAt: string }>(`/meetings/${meetingId}/note`, json('PUT', { body: text }));
      setState({ kind: 'saved', at: r.updatedAt });
    } catch (e) {
      pending.current = text;
      setState({ kind: 'error', msg: e instanceof Error ? e.message : 'Kaydedilemedi' });
    }
  };

  // Panel kapanırken bekleyen değişiklik kaybolmasın.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) void api(`/meetings/${meetingId}/note`, json('PUT', { body: pending.current })).catch(() => undefined);
  }, [meetingId]);

  const change = (text: string) => {
    setBody(text);
    pending.current = text;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(text), SAVE_DELAY_MS);
  };

  if (error) return <p className="error">{error}</p>;
  return (
    <div className="meeting-note">
      <p className="meeting-side-hint"><Lock size={12} /> Bu not yalnızca size görünür.</p>
      <textarea value={body ?? ''} disabled={body === null} placeholder="Toplantı notlarınızı buraya yazın…"
        onChange={(e) => change(e.target.value)} maxLength={50000} aria-label="Toplantı notum" />
      <small className={state.kind === 'error' ? 'error' : 'muted'} role="status">
        {state.kind === 'saving' && 'Kaydediliyor…'}
        {state.kind === 'saved' && state.at && `Kaydedildi · ${formatTime(state.at)}`}
        {state.kind === 'error' && state.msg}
      </small>
    </div>
  );
}

/** newTab: toplantı odasındayken bağlantı yeni sekmede açılır (sayfadan çıkmak görüşmeyi keserdi). */
function MeetingTasks({ meetingId, canAssign, newTab }: { meetingId: number; canAssign: boolean; newTab?: boolean }) {
  const { data, error, reload } = useApi<MeetingTask[]>(`/meetings/${meetingId}/tasks`);
  const [adding, setAdding] = useState(false);
  return (
    <div className="meeting-tasks">
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && !adding && <p className="empty">Bu toplantıda henüz görev açılmadı.</p>}
      <ul>
        {(data ?? []).map((t) => (
          <li key={t.id}>
            {t.status.isDone ? <CheckCircle2 size={16} className="done" /> : <Circle size={16} />}
            <span>
              <Link to={`/tasks?id=${t.id}`} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>{t.title}</Link>
              <small>{t.assignee?.fullName ?? 'Atanmamış'} · {t.status.name}{t.dueDate && ` · ${new Date(t.dueDate).toLocaleDateString('tr-TR')}`}</small>
            </span>
          </li>
        ))}
      </ul>
      {canAssign && (adding
        ? <MeetingTaskForm meetingId={meetingId} onDone={() => { setAdding(false); void reload(); }} onCancel={() => setAdding(false)} />
        : <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Görev aç</button>)}
    </div>
  );
}

function MeetingTaskForm({ meetingId, onDone, onCancel }: { meetingId: number; onDone(): void; onCancel(): void }) {
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const [f, setF] = useState({ title: '', assigneeId: '', dueDate: '', priority: 'normal' as Priority, description: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/meetings/${meetingId}/tasks`, json('POST', {
        title: f.title, assigneeId: Number(f.assigneeId), priority: f.priority,
        dueDate: f.dueDate || undefined, description: f.description || undefined,
      }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görev açılamadı');
      setBusy(false);
    }
  };

  return (
    <form className="form meeting-task-form" onSubmit={submit}>
      <label>Görev<input autoFocus required maxLength={250} value={f.title} onChange={up('title')} /></label>
      <label>Kime
        <select required value={f.assigneeId} onChange={up('assigneeId')}>
          <option value="">Kişi seçin</option>
          {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
      </label>
      <div className="row">
        <label>Bitiş<input type="date" value={f.dueDate} onChange={up('dueDate')} /></label>
        <label>Öncelik
          <select value={f.priority} onChange={up('priority')}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label>Açıklama<textarea rows={2} value={f.description} onChange={up('description')} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost sm" onClick={onCancel}>Vazgeç</button>
        <button className="btn primary sm" disabled={busy}>{busy ? 'Açılıyor…' : 'Görevi aç'}</button>
      </div>
    </form>
  );
}

function Attendance({ meetingId }: { meetingId: number }) {
  const { data, error } = useApi<AttendanceSession[]>(`/meetings/${meetingId}/attendance`);
  const t = (iso: string | null) => (iso ? formatTime(iso) : '…');
  return (
    <div className="meeting-tasks">
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="empty">Bu toplantıya henüz kimse katılmadı.</p>}
      {(data ?? []).map((s) => (
        <section key={s.id}>
          <small className="muted">
            {new Date(s.startedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · {t(s.startedAt)} – {s.endedAt ? t(s.endedAt) : 'sürüyor'}
          </small>
          <ul>
            {s.participants.map((p, i) => (
              <li key={`${p.id}-${i}`}>
                <span>{p.fullName}<small>{t(p.joinedAt)} – {p.leftAt ? t(p.leftAt) : s.endedAt ? t(s.endedAt) : 'içeride'}</small></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
