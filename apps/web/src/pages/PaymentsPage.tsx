import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import type { UserRef } from '../lib/types';
import {
  STATUS_LABEL, TYPE_LABEL, type Department, type Payment, type PaymentSummary,
} from '../lib/types-payments';
import { PaymentForm } from '../components/payments/PaymentForm';
import { PaymentDrawer } from '../components/payments/PaymentDrawer';
import { AssignForm } from '../components/payments/AssignForm';
import { DaysLeft, fmtDay, fmtMoney } from '../components/tracking/common';
import '../styles/tracking.css';
import '../styles/payments.css';

const VIEWS = [
  { id: 'open', label: 'Takipte' },
  { id: 'awaiting', label: 'Görevlendirme bekleyen' },
  { id: 'paid', label: 'Ödenen' },
  { id: 'cancelled', label: 'İptal' },
  { id: 'all', label: 'Tümü' },
];

export function PaymentsPage() {
  const { me, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.id === params.get('view'))?.id ?? 'open';
  const openId = Number(params.get('id')) || null;
  const [type, setType] = useState('');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Payment | null>(null);
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const query = new URLSearchParams({ status: view });
  if (type) query.set('type', type);
  if (dept) query.set('departmentId', dept);
  if (qDebounced) query.set('q', qDebounced);

  const { data: rows, error, reload } = useApi<Payment[]>(`/payments?${query}`);
  const { data: summary, reload: reloadSummary } = useApi<PaymentSummary>('/payments/summary');
  const { data: settings } = useApi<{ defaultLeadDays: number }>('/payments/settings');
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const { data: allDepts } = useApi<Department[]>('/departments');

  // Kayıt açabileceği birimler: tüm birimler (all) ya da kendi + yöneticisi olduğu birimler (department)
  const manageAll = me!.permissions['payment.manage'] === 'all';
  const formDepts = (allDepts ?? []).filter((d) => manageAll || d.id === me!.department?.id || d.manager?.id === me!.id);
  const canCreate = can('payment.manage') && formDepts.length > 0;

  const setParam = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };
  const refresh = () => { void reload(); void reloadSummary(); };
  const totals = summary?.totals30 ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ödemeler</h1>
          <p className="sub">Çek, kredi kartı, kredi taksiti, vergi ve SGK ödemeleri · vadeden {settings?.defaultLeadDays ?? 7} gün önce birim yöneticisine görev düşer</p>
        </div>
        {canCreate && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Ödeme</button>}
      </div>

      <div className="stats">
        <button className={'glass stat pay-stat' + (summary?.awaiting ? ' hot' : '')} onClick={() => setParam({ view: 'awaiting' })}>
          <small>Görevlendirme bekleyen</small><b className={summary?.awaiting ? 'warn' : ''}>{summary?.awaiting ?? '–'}</b>
        </button>
        <div className="glass stat"><small>7 gün içinde</small><b className={summary?.in7 ? 'danger' : ''}>{summary?.in7 ?? '–'}</b></div>
        <div className="glass stat">
          <small>30 gün içinde · {summary?.in30 ?? 0} ödeme</small>
          <b className="pay-total">{totals.length ? totals.map((t) => <span key={t.currency}>{fmtMoney(t.amount, t.currency)}</span>) : '–'}</b>
        </div>
        <div className="glass stat"><small>Vadesi geçen</small><b className={summary?.overdue ? 'danger' : ''}>{summary?.overdue ?? '–'}</b></div>
      </div>

      <div className="tabs">
        <div className="seg" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''}
              onClick={() => setParam({ view: v.id === 'open' ? null : v.id })}>
              {v.label}{v.id === 'awaiting' && !!summary?.awaiting && <span className="nav-count">{summary.awaiting}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="glass toolbar">
        <input className="grow" placeholder="Başlık, banka/firma veya belge no ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tür">
          <option value="">Tüm türler</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Birim">
          <option value="">Tüm birimler</option>
          {(allDepts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="glass table-wrap">
        <table className="table pay-table">
          <thead><tr><th>Kalan</th><th>Ödeme</th><th>Vade</th><th>Tutar</th><th>Birim</th><th>Durum</th><th>Görevli</th></tr></thead>
          <tbody>
            {(rows ?? []).map((p) => {
              const open = ['planned', 'awaiting', 'assigned'].includes(p.status);
              return (
                <tr key={p.id} className={p.status === 'awaiting' ? 'is-awaiting' : ''} onClick={() => setParam({ id: String(p.id) })} tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setParam({ id: String(p.id) })}>
                  <td>{open ? <DaysLeft days={p.daysLeft} /> : <span className="left muted">{p.status === 'paid' ? 'Ödendi' : 'İptal'}</span>}</td>
                  <td>
                    <b className="pay-title">{p.title}</b>
                    <small className="pay-meta"><span className="tag">{TYPE_LABEL[p.type]}</span>{p.counterparty ?? ''}{p.docNo ? ` · ${p.docNo}` : ''}</small>
                  </td>
                  <td className="mono">{fmtDay(p.dueDate)}</td>
                  <td className="mono"><b>{fmtMoney(p.amount, p.currency)}</b></td>
                  <td>{p.department.name}</td>
                  <td>
                    <span className={'pay-status ' + p.status}>{STATUS_LABEL[p.status]}</span>
                    {p.status === 'planned' && <small className="pay-meta">Görev {fmtDay(p.taskDate)}</small>}
                  </td>
                  <td>
                    {p.canAssign && p.status === 'awaiting'
                      ? <button className="btn primary sm" onClick={(e) => { e.stopPropagation(); setAssigning(p); }}><UserPlus size={14} /> Görevlendir</button>
                      : p.assignee?.fullName ?? '—'}
                  </td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && <tr><td colSpan={7} className="empty">{view === 'awaiting' ? 'Görevlendirme bekleyen ödeme yok' : 'Kayıt yok'}</td></tr>}
          </tbody>
        </table>
      </div>

      {creating && settings && (
        <PaymentForm departments={formDepts} defaultLeadDays={settings.defaultLeadDays} onClose={() => setCreating(false)}
          onSaved={(p) => { setCreating(false); refresh(); setParam({ id: String(p.id) }); }} />
      )}
      {assigning && users && (
        <AssignForm payment={assigning} users={users} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); refresh(); }} />
      )}
      {openId && users && settings && (
        <PaymentDrawer key={openId} paymentId={openId} users={users} departments={formDepts.length ? formDepts : allDepts ?? []}
          defaultLeadDays={settings.defaultLeadDays} onClose={() => setParam({ id: null })} onChanged={refresh} />
      )}
    </>
  );
}
