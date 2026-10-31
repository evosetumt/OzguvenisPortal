import { Fragment, Suspense, lazy, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { timeAgo } from '../lib/format';
import { Modal } from '../components/Modal';
import {
  DECISION_DONE, DEF_STATUS_LABEL, INSTANCE_STATUS_LABEL, shortDate,
  type ProcessDefinition, type ProcessInstanceDetail, type ProcessInstanceItem,
} from '../lib/types-workflow';
import '../styles/workflow.css';

// bpmn-js büyük bir paket; yalnızca tasarımcı/izleme açılınca yüklenir.
const BpmnEditor = lazy(() => import('../components/workflow/BpmnEditor').then((m) => ({ default: m.BpmnEditor })));
const InstanceViewer = lazy(() => import('../components/workflow/InstanceViewer').then((m) => ({ default: m.InstanceViewer })));
const loading = <p className="muted">Diyagram yükleniyor…</p>;

/** Akış tasarımcısı (bpmn-js) ve süreç izleme. */
export function WorkflowsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'monitor' ? 'monitor' : 'defs';
  const editId = Number(params.get('def')) || null;
  const instId = Number(params.get('inst')) || null;
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };

  if (editId) {
    return (
      <Suspense fallback={loading}>
        <BpmnEditor key={editId} definitionId={editId} onBack={() => setParam('def', null)} onSaved={(d) => d.id !== editId && setParam('def', String(d.id))} />
      </Suspense>
    );
  }
  if (instId) return <InstanceDetail id={instId} onBack={() => setParam('inst', null)} />;

  return (
    <>
      <h1>Akış Tasarımcısı</h1>
      <p className="sub">BPMN süreç tanımları ve çalışan süreçlerin izlenmesi</p>
      <div className="glass toolbar">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'defs'} className={tab === 'defs' ? 'on' : ''} onClick={() => setParam('tab', null)}>Süreçler</button>
          <button role="tab" aria-selected={tab === 'monitor'} className={tab === 'monitor' ? 'on' : ''} onClick={() => setParam('tab', 'monitor')}>İzleme</button>
        </div>
      </div>
      {tab === 'defs'
        ? <Definitions onOpen={(id) => setParam('def', String(id))} />
        : <Instances onOpen={(id) => setParam('inst', String(id))} />}
    </>
  );
}

function Definitions({ onOpen }: { onOpen(id: number): void }) {
  const { data: defs, error, reload } = useApi<ProcessDefinition[]>('/process-definitions');
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, ProcessDefinition[]>();
    for (const d of defs ?? []) m.set(d.key, [...(m.get(d.key) ?? []), d]);
    return [...m.values()];
  }, [defs]);

  const archive = async (d: ProcessDefinition) => {
    if (!window.confirm(`${d.name} v${d.version} arşivlensin mi? Etkin sürüm arşivlenirse bu süreç yeni kayıt başlatamaz.`)) return;
    await api(`/process-definitions/${d.id}/archive`, json('POST'));
    void reload();
  };

  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Yeni süreç</button>
      </div>
      {error && <p className="error">{error}</p>}
      {groups.map((versions) => (
        <section key={versions[0].key} className="glass panel def-group">
          <h3>{versions.find((v) => v.status === 'active')?.name ?? versions[0].name} <small><code>{versions[0].key}</code></small></h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Sürüm</th><th>Durum</th><th>Süreç sayısı</th><th>Güncellendi</th><th /></tr></thead>
              <tbody>
                {versions.map((d) => (
                  <tr key={d.id} onClick={() => onOpen(d.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                    <td><b>v{d.version}</b></td>
                    <td><span className={`status ${d.status}`}>{DEF_STATUS_LABEL[d.status]}</span></td>
                    <td>{d._count.instances}</td>
                    <td>{timeAgo(d.updatedAt)}</td>
                    <td className="num">
                      {d.status !== 'archived' && <button className="link-btn" onClick={(e) => { e.stopPropagation(); void archive(d); }}>Arşivle</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {defs && !defs.length && <p className="empty">Henüz süreç tanımı yok</p>}
      {creating && <NewDefinition onClose={() => setCreating(false)} onCreated={(d) => { setCreating(false); onOpen(d.id); }} />}
    </>
  );
}

function NewDefinition({ onClose, onCreated }: { onClose(): void; onCreated(d: ProcessDefinition): void }) {
  const [f, setF] = useState({ key: '', name: '' });
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { onCreated(await api<ProcessDefinition>('/process-definitions', json('POST', f))); } catch (x) { setErr(x instanceof Error ? x.message : 'Oluşturulamadı'); }
  };
  return (
    <Modal title="Yeni süreç" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Ad<input required minLength={2} maxLength={150} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="İzin talebi" /></label>
        <label>Anahtar<input required pattern="[a-z][a-z0-9_]{1,59}" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase() })} placeholder="izin_talebi" /></label>
        <p className="hint">Anahtar, kodun süreci başlatırken kullandığı addır; sonradan değişmez.</p>
        {err && <p className="error">{err}</p>}
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button><button className="btn primary">Oluştur</button></div>
      </form>
    </Modal>
  );
}

function Instances({ onOpen }: { onOpen(id: number): void }) {
  const [status, setStatus] = useState('');
  const { data: rows, error } = useApi<ProcessInstanceItem[]>(`/process-instances${status ? `?status=${status}` : ''}`);
  return (
    <>
      <div className="actions" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
          <option value="">Tüm durumlar</option>
          {Object.entries(INSTANCE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Kayıt</th><th>Süreç</th><th>Durum</th><th>Bekleyen</th><th>Başlatan</th><th>Başlangıç</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}>
                <td>{r.id}</td>
                <td>{r.businessKey ?? '—'}</td>
                <td>{r.definition.name} <small>v{r.definition.version}</small></td>
                <td><span className={`status ${r.status}`}>{INSTANCE_STATUS_LABEL[r.status]}</span></td>
                <td>{r.tasks.map((t) => `${t.name} (${t.assignee?.fullName ?? t.candidateRole ?? '—'})`).join(', ') || '—'}</td>
                <td>{r.startedBy?.fullName ?? '—'}</td>
                <td>{timeAgo(r.startedAt)}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={7} className="empty">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  started: 'Başladı', entered: 'Adıma girildi', completed: 'Adım tamamlandı', task_created: 'Görev oluşturuldu',
  task_completed: 'Görev tamamlandı', error: 'Hata', ended: 'Bitti', cancelled: 'İptal edildi',
};

function InstanceDetail({ id, onBack }: { id: number; onBack(): void }) {
  const { data: inst, error } = useApi<ProcessInstanceDetail>(`/process-instances/${id}`);
  return (
    <>
      <button className="link-btn" onClick={onBack}><ArrowLeft size={14} /> İzleme</button>
      <h1>{inst?.businessKey ?? `Süreç #${id}`}</h1>
      {inst && (
        <p className="sub">{inst.definition.name} v{inst.definition.version} · <span className={`status ${inst.status}`}>{INSTANCE_STATUS_LABEL[inst.status]}</span>
          {' '}· {inst.startedBy?.fullName ?? '—'} · {shortDate(inst.startedAt)}</p>
      )}
      {error && <p className="error">{error}</p>}
      {inst?.error && <p className="errors">{inst.error}</p>}
      {inst && <Suspense fallback={loading}><InstanceViewer xml={inst.definition.bpmnXml} highlight={inst.highlight} /></Suspense>}
      {inst && (
        <div className="home-grid">
          <section className="glass panel">
            <h3>Görevler</h3>
            <ul className="timeline">
              {inst.tasks.map((t) => (
                <li key={t.id} className={t.status === 'open' ? 'pending' : (t.formData?.decision ?? 'approved')}>
                  <b>{t.name}</b> <small>{t.status === 'open' ? `bekliyor · ${t.assignee?.fullName ?? t.candidateRole ?? ''}` : `${DECISION_DONE[t.formData?.decision ?? ''] ?? t.status} · ${t.completedBy?.fullName ?? ''}`}</small>
                  {t.formData?.comment && <p>{t.formData.comment}</p>}
                </li>
              ))}
              {!inst.tasks.length && <li className="muted">Kullanıcı görevi yok</li>}
            </ul>
          </section>
          <section className="glass panel">
            <h3>Olay günlüğü</h3>
            <ul className="rows">
              {inst.events.filter((e) => e.type !== 'entered').map((e) => (
                <li key={e.id} className="row-line">
                  <span>{EVENT_LABEL[e.type] ?? e.type}{e.elementId ? <small> · {e.elementId}</small> : null}</span>
                  <small>{new Date(e.at).toLocaleTimeString('tr-TR')}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="glass panel">
            <h3>Değişkenler</h3>
            <dl className="kv">
              {Object.entries(inst.variables ?? {}).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{String(v ?? '—')}</dd></Fragment>)}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
