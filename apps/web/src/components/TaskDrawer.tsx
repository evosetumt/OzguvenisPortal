import { useEffect, useState, type FormEvent } from 'react';
import { Avatar } from './Avatar';
import { Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Link } from 'react-router-dom';
import { dateKey, initials, timeAgo } from '../lib/format';
import { CustomerPicker } from './CustomerPicker';
import { PRIORITY_LABEL, TASK_TYPE_LABEL, type Project, type TaskDetail, type TaskStatus, type UserRef } from '../lib/types';

interface Props {
  taskId: number;
  projects: Project[];
  statuses: TaskStatus[];
  users: UserRef[];
  onClose(): void;
  onChanged(): void;
}

export function TaskDrawer({ taskId, projects, statuses, users, onClose, onChanged }: Props) {
  const { me } = useAuth();
  const { data: t, setData, error, reload } = useApi<TaskDetail>(`/tasks/${taskId}`);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [newSub, setNewSub] = useState('');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (t) { setTitle(t.title); setDesc(t.description ?? ''); } }, [t?.id, t?.title, t?.description]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); await reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'İşlem başarısız'); }
  };
  const patch = (body: Record<string, unknown>) => run(() => api<TaskDetail>(`/tasks/${taskId}`, json('PATCH', body)).then(setData));

  const addSub = (e: FormEvent) => {
    e.preventDefault();
    if (!newSub.trim()) return;
    void run(() => api(`/tasks/${taskId}/subtasks`, json('POST', { title: newSub }))).then(() => setNewSub(''));
  };
  const addComment = (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    void run(() => api(`/tasks/${taskId}/comments`, json('POST', { body: comment }))).then(() => setComment(''));
  };
  const remove = async () => {
    if (!window.confirm('Görev silinsin mi?')) return;
    await run(() => api(`/tasks/${taskId}`, json('DELETE')));
    onClose();
  };

  const ro = !t?.canEdit;
  // Netsis otomatik kapanış alanları (API'de var, ortak TaskDetail tipinde yok)
  const erp = (t ?? {}) as { completedViaErp?: boolean; relatedType?: string | null; relatedId?: string | null };

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer" role="dialog" aria-modal="true" aria-label="Görev ayrıntısı">
        <header className="modal-head">
          <small>#{taskId}{t?.project && <> · <span style={{ color: t.project.color }}>●</span> {t.project.name}</>}</small>
          <div>
            {t?.canEdit && <button className="icon-btn" title="Sil" onClick={remove}><Trash2 size={16} /></button>}
            <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {!t && !error && <p className="empty">Yükleniyor…</p>}
        {t && (
          <div className="drawer-body">
            <input className="title-input" value={title} readOnly={ro} maxLength={250}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== t.title && patch({ title })} />
            {err && <p className="error" role="alert">{err}</p>}
            {erp.relatedType === 'process_task' && erp.relatedId && !t.status.isDone && (
              <div className="td-callout">
                <span><b>Onay görevi</b><small>Onaylamak veya reddetmek için karar ekranını açın; karar verilince görev kendiliğinden tamamlanır.</small></span>
                <Link className="btn primary sm" to={`/approvals?task=${erp.relatedId}`} onClick={onClose}>Karar ver</Link>
              </div>
            )}
            {erp.relatedType === 'payment' && erp.relatedId && (
              <div className="td-callout">
                <span><b>Ödeme görevi</b><small>Görev tamamlanınca ödeme "ödendi" olarak işaretlenir.</small></span>
                <Link className="btn sm" to={`/payments?id=${erp.relatedId}`} onClick={onClose}>Ödemeyi aç</Link>
              </div>
            )}

            <dl className="props">
              <dt>Durum</dt>
              <dd><select disabled={ro} value={t.statusId} onChange={(e) => patch({ statusId: Number(e.target.value) })}>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></dd>
              <dt>Atanan</dt>
              <dd><select disabled={ro} value={t.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Atanmamış</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select></dd>
              <dt>Proje</dt>
              <dd><select disabled={ro} value={t.projectId ?? ''} onChange={(e) => patch({ projectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></dd>
              <dt>Öncelik</dt>
              <dd><select disabled={ro} value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></dd>
              <dt>Bitiş</dt>
              <dd><input type="date" disabled={ro} value={t.dueDate ? dateKey(t.dueDate) : ''} onChange={(e) => patch({ dueDate: e.target.value || null })} /></dd>
              <dt>Tür</dt>
              <dd><select disabled={ro} value={t.taskType} onChange={(e) => patch({ taskType: e.target.value })}>
                {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></dd>
              {t.taskType !== 'general' && <>
                <dt>Cari kodu</dt>
                <dd><CustomerField key={t.customerRef ?? ''} initial={t.customerRef ?? ''} disabled={ro}
                  onCommit={(v) => v !== (t.customerRef ?? '') && patch({ customerRef: v || null })} /></dd>
                <dt>Belge no</dt>
                <dd><input disabled={ro} defaultValue={t.erpDocNo ?? ''} maxLength={60} placeholder="Netsis'te oluşunca dolar"
                  onBlur={(e) => e.target.value !== (t.erpDocNo ?? '') && patch({ erpDocNo: e.target.value || null })} /></dd>
                {erp.completedViaErp && <>
                  <dt>Netsis</dt>
                  <dd>
                    <span className="tag erp-done">Netsis'te tamamlandı</span>{' '}
                    {erp.relatedId && (
                      <Link className="link-btn" to={`/orders?${erp.relatedType === 'erp_quote' ? 'tab=quotes&' : ''}q=${encodeURIComponent(erp.relatedId)}`}>
                        {erp.relatedType === 'erp_quote' ? 'Teklif' : 'Sipariş'} {erp.relatedId}
                      </Link>
                    )}
                  </dd>
                </>}
              </>}
              <dt>Oluşturan</dt>
              <dd>{t.createdBy.fullName}</dd>
            </dl>

            <h4>Açıklama</h4>
            <textarea rows={4} readOnly={ro} value={desc} placeholder={ro ? '' : 'Ayrıntı ekleyin…'}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== (t.description ?? '') && patch({ description: desc || null })} />

            <h4>Alt görevler <small>{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}</small></h4>
            <ul className="subtasks">
              {t.subtasks.map((s) => (
                <li key={s.id}>
                  <label>
                    <input type="checkbox" checked={s.done} disabled={ro}
                      onChange={() => run(() => api(`/subtasks/${s.id}`, json('PATCH', { done: !s.done })))} />
                    <span className={s.done ? 'done' : ''}>{s.title}</span>
                  </label>
                  {!ro && <button className="icon-btn sm" title="Sil" onClick={() => run(() => api(`/subtasks/${s.id}`, json('DELETE')))}><X size={14} /></button>}
                </li>
              ))}
            </ul>
            {!ro && (
              <form className="inline-form" onSubmit={addSub}>
                <input placeholder="Alt görev ekle…" value={newSub} maxLength={250} onChange={(e) => setNewSub(e.target.value)} />
              </form>
            )}

            <h4>Yorumlar</h4>
            <ul className="comments">
              {t.comments.map((c) => (
                <li key={c.id}>
                  <Avatar id={c.user.id} name={c.user.fullName} size="sm" />
                  <div>
                    <b>{c.user.fullName}</b> <small>{timeAgo(c.createdAt)}</small>
                    {c.user.id === me!.id && <button className="link-btn" onClick={() => run(() => api(`/comments/${c.id}`, json('DELETE')))}>sil</button>}
                    <p>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form className="inline-form" onSubmit={addComment}>
              <textarea rows={2} placeholder="Yorum yazın…" value={comment} maxLength={5000} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(e); }} />
              <button className="btn primary sm" disabled={!comment.trim()}>Gönder</button>
            </form>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Cari kodu: Netsis önerili alan, odaktan çıkınca kaydeder. */
function CustomerField({ initial, disabled, onCommit }: { initial: string; disabled: boolean; onCommit(v: string): void }) {
  const [v, setV] = useState(initial);
  return <CustomerPicker value={v} onChange={setV} onCommit={onCommit} disabled={disabled} />;
}
