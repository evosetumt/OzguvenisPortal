import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Paperclip, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { ExpenseForm } from '../components/workflow/ExpenseForm';
import { ExpenseSummary } from '../components/workflow/ExpenseSummary';
import {
  EXPENSE_STATUS_LABEL, money, shortDate, type Expense, type ExpenseDetail, type ExpenseStatus,
} from '../lib/types-workflow';
import '../styles/workflow.css';

type View = 'mine' | 'team' | 'all';

export function ExpensesPage() {
  const { me } = useAuth();
  const perms = me!.permissions;
  const [params, setParams] = useSearchParams();
  const views: { key: View; label: string }[] = [
    { key: 'mine', label: 'Masraflarım' },
    ...(perms['expense.approve'] ? [{ key: 'team' as View, label: 'Ekibim' }] : []),
    ...(perms['expense.accounting'] === 'all' || perms['expense.approve'] === 'all' ? [{ key: 'all' as View, label: 'Tümü' }] : []),
  ];
  const [view, setView] = useState<View>('mine');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<ExpenseDetail | 'new' | null>(null);
  const [rev, setRev] = useState(0); // kayıttan sonra çekmeceyi yeniden yükle
  const q = new URLSearchParams({ view, ...(status ? { status } : {}) });
  const { data: rows, error, reload } = useApi<Expense[]>(perms['expense.create'] || view !== 'mine' ? `/expenses?${q}` : null);
  const openId = Number(params.get('id')) || null;

  const setOpen = (id: number | null) => {
    const p = new URLSearchParams(params);
    id ? p.set('id', String(id)) : p.delete('id');
    setParams(p, { replace: true });
  };
  const total = (rows ?? []).reduce((s, r) => s + r.amountTry, 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Masraflar</h1><p className="sub">Fişli masraf girişi ve onay durumu</p></div>
        {perms['expense.create'] && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Masraf</button>}
      </div>

      <div className="glass toolbar">
        {views.length > 1 && (
          <div className="seg" role="tablist">
            {views.map((v) => <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>)}
          </div>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
          <option value="">Tüm durumlar</option>
          {(Object.keys(EXPENSE_STATUS_LABEL) as ExpenseStatus[]).filter((s) => view === 'mine' || s !== 'draft')
            .map((s) => <option key={s} value={s}>{EXPENSE_STATUS_LABEL[s]}</option>)}
        </select>
        <span className="push muted">{rows ? `${rows.length} kayıt · ${money(total)}` : ''}</span>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Tarih</th><th>Açıklama</th>{view !== 'mine' && <th>Personel</th>}<th>Kategori</th><th className="num">Tutar</th><th>Durum</th></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}>
                <td>{shortDate(r.expenseDate)}</td>
                <td>{r.description}{r._count.receipts > 0 && <small> <Paperclip size={11} />{r._count.receipts}</small>}</td>
                {view !== 'mine' && <td>{r.user.fullName}</td>}
                <td>{r.category.name}</td>
                <td className="num">{money(r.amount, r.currency)}</td>
                <td><span className={`status ${r.status}`}>{EXPENSE_STATUS_LABEL[r.status]}</span></td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={6} className="empty">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>

      {openId && <ExpenseDrawer key={`${openId}-${rev}`} id={openId} onClose={() => setOpen(null)} onEdit={(e) => setEditing(e)} onChanged={reload} />}
      {editing && (
        <ExpenseForm expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
          onSaved={(e) => { setEditing(null); setRev((n) => n + 1); void reload(); setOpen(e.id); }} />
      )}
    </>
  );
}

function ExpenseDrawer({ id, onClose, onEdit, onChanged }: { id: number; onClose(): void; onEdit(e: ExpenseDetail): void; onChanged(): void }) {
  const { data: e, error, reload } = useApi<ExpenseDetail>(`/expenses/${id}`);
  const [err, setErr] = useState('');
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (fn: () => Promise<unknown>, close = false) => {
    setErr('');
    try { await fn(); onChanged(); close ? onClose() : await reload(); } catch (x) { setErr(x instanceof Error ? x.message : 'İşlem başarısız'); }
  };

  return (
    <div className="overlay drawer-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <aside className="glass drawer" role="dialog" aria-modal="true" aria-label={`Masraf #${id}`}>
        <header className="modal-head"><h2>Masraf #{id}</h2><button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button></header>
        {error && <p className="error">{error}</p>}
        {e && (
          <>
            <ExpenseSummary e={e} />
            {err && <p className="error" role="alert">{err}</p>}
            {e.canEdit && (
              <div className="actions">
                {e.status === 'draft' && (
                  <button className="btn danger push-right" onClick={() => window.confirm('Taslak silinsin mi?') && void act(() => api(`/expenses/${id}`, json('DELETE')), true)}>Sil</button>
                )}
                <button className="btn ghost" onClick={() => onEdit(e)}>Düzenle</button>
                <button className="btn primary" onClick={() => void act(() => api(`/expenses/${id}/submit`, json('POST')))}>
                  {e.status === 'rejected' ? 'Yeniden gönder' : 'Onaya gönder'}
                </button>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
