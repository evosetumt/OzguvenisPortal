import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { ChevronRight, Receipt } from 'lucide-react';
import { timeAgo } from '../lib/format';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { ExpenseSummary } from '../components/workflow/ExpenseSummary';
import {
  DECISION_DONE, DECISION_LABEL, shortDate, type ExpenseDetail, type ProcessTaskItem,
} from '../lib/types-workflow';
import '../styles/workflow.css';

/** businessKey "Masraf #20 · Emre Arslan · 1.850,00 TL" → başlık ve tutar ayrı gösterilir. */
function splitKey(t: ProcessTaskItem) {
  const parts = (t.instance.businessKey ?? t.instance.definition.name).split(' · ');
  const amount = parts.length > 1 && /\d.*(TL|USD|EUR|₺)$/.test(parts[parts.length - 1]) ? parts.pop()! : null;
  return { title: parts.join(' · '), amount };
}

/** Onay kutusu: kullanıcıya atanmış veya rolüne açık süreç görevleri. Liste satırına tıklayınca ayrıntı ve karar penceresi açılır. */
export function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const { data: tasks, error, reload } = useApi<ProcessTaskItem[]>(`/process-tasks/mine${tab === 'done' ? '?status=done' : ''}`);
  const selectedId = Number(params.get('task')) || null;
  const selected = tasks?.find((t) => t.id === selectedId) ?? null;

  const select = (id: number | null) => {
    const p = new URLSearchParams(params);
    id ? p.set('task', String(id)) : p.delete('task');
    setParams(p, { replace: true });
  };
  // Yeni gelen onaylar için liste 30 sn'de bir ve sekmeye dönünce tazelenir
  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000);
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [reload]);

  return (
    <>
      <h1>Onaylarım</h1>
      <p className="sub">Onayınızı bekleyen iş akışı görevleri</p>
      <div className="glass toolbar">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => { setTab('open'); select(null); }}>Bekleyen</button>
          <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => { setTab('done'); select(null); }}>Tamamladıklarım</button>
        </div>
        <span className="push muted">{tasks ? `${tasks.length} görev` : ''}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="glass ap-list">
        <ul>
          {tasks?.map((t) => {
            const { title, amount } = splitKey(t);
            const who = t.instance.startedBy;
            const decision = t.formData?.decision ?? '';
            return (
              <li key={t.id}>
                <button className={'ap-row' + (t.overdue && t.status === 'open' ? ' is-late' : '')} onClick={() => select(t.id)}>
                  {who ? <Avatar id={who.id} name={who.fullName} /> : <span className="avatar"><Receipt size={16} /></span>}
                  <span className="ap-main">
                    <b>{title}</b>
                    <small>
                      <span className="ap-step">{t.name}</span>
                      {t.instance.definition.name}
                      {t.status === 'open' && t.candidateLabel && <> · {t.candidateLabel}</>}
                    </small>
                  </span>
                  {amount && <span className="ap-amount">{amount}</span>}
                  <span className="ap-when">
                    {t.status === 'open'
                      ? <>{t.overdue ? <span className="ap-late">Gecikti</span> : timeAgo(t.createdAt)}</>
                      : <span className={'ap-dec ' + decision}>{DECISION_DONE[decision] ?? '—'}</span>}
                    {t.status !== 'open' && t.completedAt && <small>{timeAgo(t.completedAt)}</small>}
                  </span>
                  <ChevronRight size={18} className="ap-chev" />
                </button>
              </li>
            );
          })}
          {tasks && !tasks.length && <li className="empty ap-empty">{tab === 'open' ? 'Bekleyen onay yok 🎉' : 'Kayıt yok'}</li>}
        </ul>
      </section>
      {selected && (
        <Modal title={selected.name} onClose={() => select(null)} wide>
          <TaskPanel key={selected.id} task={selected} onDone={() => { select(null); void reload(); }} />
        </Modal>
      )}
    </>
  );
}

function TaskPanel({ task, onDone }: { task: ProcessTaskItem; onDone(): void }) {
  const isExpense = task.instance.entityType === 'expense' && task.instance.entityId;
  const { data: expense, error: expErr } = useApi<ExpenseDetail>(isExpense ? `/expenses/${task.instance.entityId}` : null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const decide = async (decision: string) => {
    if (decision === 'rejected' && !comment.trim()) { setErr('Red için açıklama yazın'); return; }
    setBusy(true);
    setErr('');
    try {
      await api(`/process-tasks/${task.id}/complete`, json('POST', { decision, comment: comment.trim() || undefined }));
      onDone();
    } catch (x) { setErr(x instanceof Error ? x.message : 'İşlem başarısız'); } finally { setBusy(false); }
  };

  return (
    <div className="ap-detail">
      <dl className="kv">
        <dt>Süreç</dt><dd>{task.instance.definition.name} #{task.instance.id}</dd>
        <dt>Başlatan</dt><dd>{task.instance.startedBy?.fullName ?? '—'} · {shortDate(task.instance.startedAt)}</dd>
        {task.status === 'open' && task.dueAt && <><dt>Son tarih</dt><dd className={task.overdue ? 'overdue' : ''}>{new Date(task.dueAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
        {task.status !== 'open' && <><dt>Kararınız</dt><dd>{DECISION_DONE[task.formData?.decision ?? ''] ?? task.formData?.decision}{task.formData?.comment ? ` · ${task.formData.comment}` : ''}</dd></>}
      </dl>
      {expErr && <p className="error">{expErr}</p>}
      {expense && <ExpenseSummary e={expense} />}
      {task.status === 'open' && (
        <div className="decide">
          <label className="field">Açıklama (red için zorunlu)
            <textarea rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="actions">
            {task.decisions.map((d) => (
              <button key={d} disabled={busy} onClick={() => void decide(d)}
                className={'btn ' + (d === 'rejected' ? 'danger' : d === 'approved' ? 'primary' : 'ok-btn')}>
                {DECISION_LABEL[d] ?? d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
