import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useOverlay } from '../lib/overlay-stack';
import { useAuth } from '../lib/auth';
import { ExpenseForm } from '../components/workflow/ExpenseForm';
import { ExpenseSummary } from '../components/workflow/ExpenseSummary';
import {
  EXPENSE_STATUS_LABEL, money, shortDate, type Expense, type ExpenseDetail, type ExpenseDraftSummary, type ExpenseStatus,
  type SubmitDraftsResult,
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
  const [draftRev, setDraftRev] = useState(0); // değişiklikten sonra taslak bölümünü yeniden yükle
  const q = new URLSearchParams({ view, ...(status ? { status } : {}) });
  const { data: rows, error, reload } = useApi<Expense[]>(perms['expense.create'] || view !== 'mine' ? `/expenses?${q}` : null);
  const openId = Number(params.get('id')) || null;

  const setOpen = (id: number | null) => {
    const p = new URLSearchParams(params);
    id ? p.set('id', String(id)) : p.delete('id');
    setParams(p, { replace: true });
  };
  // "Masraflarım"da taslaklar üstteki taslak bölümünde; tablo onaya gönderilmiş masrafları gösterir.
  const showDrafts = view === 'mine' && !!perms['expense.create'];
  const list = showDrafts ? rows?.filter((r) => r.status !== 'draft') : rows;
  const total = (list ?? []).reduce((s, r) => s + r.amountTry, 0);
  const changed = () => { setDraftRev((n) => n + 1); void reload(); };

  return (
    <>
      <div className="page-head">
        <div><h1>Masraflar</h1></div>
        {perms['expense.create'] && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Masraf</button>}
      </div>

      {showDrafts && <DraftsPanel key={draftRev} onOpen={setOpen} onChanged={changed} />}

      <div className="glass toolbar">
        {views.length > 1 && (
          <div className="seg" role="tablist">
            {views.map((v) => <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>)}
          </div>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
          <option value="">Tüm durumlar</option>
          {(Object.keys(EXPENSE_STATUS_LABEL) as ExpenseStatus[]).filter((s) => s !== 'draft' || (view === 'mine' && !showDrafts))
            .map((s) => <option key={s} value={s}>{EXPENSE_STATUS_LABEL[s]}</option>)}
        </select>
        <span className="push muted">{list ? `${list.length} kayıt · ${money(total)}` : ''}</span>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Tarih</th><th>Açıklama</th>{view !== 'mine' && <th>Personel</th>}<th>Kategori</th><th className="num">Tutar</th><th>Durum</th></tr></thead>
          <tbody>
            {list?.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}>
                <td>{shortDate(r.expenseDate)}</td>
                <td>{r.description}{r._count.receipts > 0 && <small> <Paperclip size={11} />{r._count.receipts}</small>}</td>
                {view !== 'mine' && <td>{r.user.fullName}</td>}
                <td>{r.category.name}</td>
                <td className="num">{money(r.amount, r.currency)}</td>
                <td><span className={`status ${r.status}`}>{EXPENSE_STATUS_LABEL[r.status]}</span></td>
              </tr>
            ))}
            {list && !list.length && <tr><td colSpan={6} className="empty">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>

      {openId && <ExpenseDrawer key={`${openId}-${rev}`} id={openId} onClose={() => setOpen(null)} onEdit={(e) => setEditing(e)} onChanged={changed} />}
      {editing && (
        <ExpenseForm expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
          onSaved={(e, submitted) => {
            setEditing(null); setRev((n) => n + 1); changed();
            if (submitted) setOpen(e.id); // yeni taslak için detay otomatik açılmaz
          }} />
      )}
    </>
  );
}

/** Taslak fişlerim: kategori bazında toplam, taslak listesi ve toplu onaya gönderme. */
function DraftsPanel({ onOpen, onChanged }: { onOpen(id: number): void; onChanged(): void }) {
  const { data: sum, error } = useApi<ExpenseDraftSummary>('/expenses/draft-summary');
  const { data: drafts } = useApi<Expense[]>('/expenses?view=mine&status=draft');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (x) { setErr(x instanceof Error ? x.message : 'İşlem başarısız'); } finally { setBusy(false); }
  };

  const submitAll = () => {
    if (!sum || !window.confirm(`${sum.count} fiş (${money(sum.totalTry)}) onaya gönderilsin mi?`)) return;
    void run(async () => {
      const r = await api<SubmitDraftsResult>('/expenses/submit', json('POST', {}));
      if (r.failed.length) {
        window.alert(`${r.submitted.length} fiş gönderildi, ${r.failed.length} fiş gönderilemedi:\n${r.failed.map((f) => `#${f.id}: ${f.error}`).join('\n')}`);
      }
      onChanged();
    });
  };

  const remove = (d: Expense) => {
    if (!window.confirm(`"${d.description}" taslağı silinsin mi?`)) return;
    void run(async () => { await api(`/expenses/${d.id}`, json('DELETE')); onChanged(); });
  };

  if (error) return <p className="error">{error}</p>;
  if (!sum?.count) return null;

  return (
    <section className="glass drafts" aria-label="Taslak fişlerim">
      <header className="drafts-head">
        <h2>Taslak fişlerim</h2>
        <span className="drafts-total">{money(sum.totalTry)}</span>
      </header>
      <ul className="drafts-cats">
        {sum.categories.map((c) => (
          <li key={c.categoryId}><span>{c.name}</span><small>{c.count} fiş</small><b>{money(c.totalTry)}</b></li>
        ))}
      </ul>
      <ul className="drafts-list">
        {drafts?.map((d) => (
          <li key={d.id}>
            <button type="button" className="drafts-item" onClick={() => onOpen(d.id)}>
              <span className="drafts-desc">{d.description}</span>
              <small>
                {shortDate(d.expenseDate)} · {d.category.name}
                {d._count.receipts > 0 ? <> · <Paperclip size={11} />{d._count.receipts}</> : <span className="drafts-warn"> · fiş yok</span>}
              </small>
            </button>
            <span className="drafts-amt">{money(d.amount, d.currency)}</span>
            <button type="button" className="icon-btn" title="Taslağı sil" aria-label="Taslağı sil" disabled={busy} onClick={() => remove(d)}><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      {sum.missingReceipts > 0 && <p className="drafts-warn">{sum.missingReceipts} taslakta fiş yok; fiş eklenmeden onaya gönderilemez.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={submitAll}>
          <Send size={15} /> {busy ? 'Gönderiliyor…' : `Tümünü onaya gönder (${sum.count} fiş)`}
        </button>
      </div>
    </section>
  );
}

function ExpenseDrawer({ id, onClose, onEdit, onChanged }: { id: number; onClose(): void; onEdit(e: ExpenseDetail): void; onChanged(): void }) {
  const { data: e, error, reload } = useApi<ExpenseDetail>(`/expenses/${id}`);
  const [err, setErr] = useState('');
  useOverlay(onClose);

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
