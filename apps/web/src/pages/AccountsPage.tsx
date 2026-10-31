import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, X } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { QUOTE_STATUS_LABEL, day, money, type Customer, type CustomerDetail, type ErpSummary } from '../lib/types-erp';
import { StatusBadge } from './OrdersPage';
import { EDocumentPreview } from '../components/EDocumentPreview';
import '../styles/erp.css';

/** Netsis cari kartları, bakiyeler ve ekstre (salt okunur). */
export function AccountsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [debtors, setDebtors] = useState(false);
  useEffect(() => { const h = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(h); }, [q]);

  const query = new URLSearchParams();
  if (qd) query.set('q', qd);
  if (debtors) query.set('debtors', '1');
  const { data, error, loading } = useApi<{ total: number; items: Customer[] }>(`/erp/customers?${query}`);
  const { data: summary } = useApi<ErpSummary>(can('report.read') ? '/erp/reports/summary' : null);
  const code = params.get('code');
  const open = (c: string | null) => {
    const p = new URLSearchParams(params);
    c ? p.set('code', c) : p.delete('code');
    setParams(p, { replace: true });
  };

  return (
    <>
      <h1>Cari Hesaplar</h1>
      <p className="sub">Netsis cari kartları ve bakiyeleri. Bakiye = borç − alacak (pozitif: cari bize borçlu).</p>

      {summary && (
        <div className="erp-grid">
          <section className="glass panel">
            <h3>Toplam alacak <span className="push">{money(summary.receivables)}</span></h3>
            <ul className="rows">
              {summary.topCustomers.map((c) => (
                <li key={c.code}><a href={`#/accounts?code=${encodeURIComponent(c.code)}`} onClick={(e) => { e.preventDefault(); open(c.code); }}>
                  <span>{c.name}</span><small>{money(c.balance)}</small>
                </a></li>
              ))}
            </ul>
          </section>
          <section className="glass panel">
            <h3>Vadesi geçmiş alacak <span className="push danger">{money(summary.overdueTotal)}</span></h3>
            {summary.overdue.length ? (
              <ul className="rows">
                {summary.overdue.map((c) => (
                  <li key={c.code}><a href={`#/accounts?code=${encodeURIComponent(c.code)}`} onClick={(e) => { e.preventDefault(); open(c.code); }}>
                    <span>{c.name}</span><small className="danger">{money(c.amount)}</small>
                  </a></li>
                ))}
              </ul>
            ) : <p className="empty">Vadesi geçmiş alacak yok.</p>}
            <small>Yaklaşık: vadesi geçmiş borç hareketleri, carinin güncel bakiyesiyle sınırlanır.</small>
          </section>
        </div>
      )}

      <div className="glass toolbar">
        <input className="grow" placeholder="Cari kodu, ünvan veya vergi no…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ara" />
        <label className="check"><input type="checkbox" checked={debtors} onChange={(e) => setDebtors(e.target.checked)} /> Yalnız borçlular</label>
        {data && <small>{data.total} cari{data.total > data.items.length ? ` (ilk ${data.items.length})` : ''}</small>}
      </div>

      <div className="glass table-wrap">
        {error && <p className="error panel">{error}</p>}
        <table className="table">
          <thead><tr><th>Kod</th><th>Ünvan</th><th>İl</th><th>Plasiyer</th><th className="num">Borç</th><th className="num">Alacak</th><th className="num">Bakiye</th></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.code} onClick={() => open(c.code)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(c.code)}>
                <td>{c.code}</td>
                <td><b>{c.name}</b></td>
                <td>{c.city ?? '—'}</td>
                <td>{c.repCode ?? '—'}</td>
                <td className="num">{money(c.debit)}</td>
                <td className="num">{money(c.credit)}</td>
                <td className={'num ' + (c.balance > 0 ? 'erp-debit' : c.balance < 0 ? 'erp-credit' : '')}><b>{money(c.balance)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && data?.items.length === 0 && <p className="empty panel">Cari bulunamadı.</p>}
      </div>

      {code && <CustomerDrawer code={code} onClose={() => open(null)} />}
    </>
  );
}

function CustomerDrawer({ code, onClose }: { code: string; onClose(): void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const { data: c, error } = useApi<CustomerDetail>(`/erp/customers/${encodeURIComponent(code)}`);
  useEffect(() => {
    // e-Belge önizlemesi açıkken Esc yalnızca önizlemeyi kapatsın
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !preview && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, preview]);

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer erp-drawer" role="dialog" aria-modal="true" aria-label="Cari detayı">
        <header className="modal-head">
          <h2>{c?.name ?? code}</h2>
          <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
        </header>
        {error && <p className="error">{error}</p>}
        {c && (
          <>
            <div className="stats">
              <div className="glass stat"><small>Borç</small><b>{money(c.debit)}</b></div>
              <div className="glass stat"><small>Alacak</small><b>{money(c.credit)}</b></div>
              <div className="glass stat"><small>Bakiye</small><b className={c.balance > 0 ? 'erp-debit' : 'erp-credit'}>{money(c.balance)}</b></div>
            </div>
            <dl className="props erp-props">
              <dt>Kod</dt><dd>{c.code}</dd>
              {c.taxNo && <><dt>Vergi</dt><dd>{c.taxOffice ?? ''} {c.taxNo}</dd></>}
              {c.phone && <><dt>Telefon</dt><dd><a href={`tel:${c.phone}`}>{c.phone}</a></dd></>}
              {c.email && <><dt>E-posta</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></>}
              {(c.address || c.city) && <><dt>Adres</dt><dd>{[c.address, c.city].filter(Boolean).join(', ')}</dd></>}
              <dt>Plasiyer</dt><dd>{c.repCode ?? '—'}</dd>
            </dl>

            <h4>Ekstre</h4>
            <div className="table-wrap">
              <table className="table static statement">
                <thead><tr><th>Tarih</th><th>Belge</th><th>Açıklama</th><th>Vade</th><th className="num">Borç</th><th className="num">Alacak</th><th className="num">Bakiye</th></tr></thead>
                <tbody>
                  <tr className="opening"><td colSpan={6}>Devir (önceki dönem)</td><td className="num">{money(c.opening)}</td></tr>
                  {c.statement.map((x) => (
                    <tr key={x.id}>
                      <td>{day(x.date)}</td>
                      <td>{x.eDoc && x.docNo
                        ? <button className="link-btn edoc-link" title="e-Belge önizlemesi" onClick={() => setPreview(x.docNo)}><FileText size={13} /> {x.docNo}</button>
                        : x.docNo ?? '—'}</td>
                      <td>{x.description ?? '—'}</td>
                      <td className={x.dueDate && x.debit > 0 && new Date(x.dueDate) < new Date() ? 'danger' : ''}>{day(x.dueDate)}</td>
                      <td className="num">{x.debit ? money(x.debit) : ''}</td>
                      <td className="num">{x.credit ? money(x.credit) : ''}</td>
                      <td className="num">{money(x.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {c.orders.length > 0 && <>
              <h4>Siparişler</h4>
              <ul className="rows">
                {c.orders.map((o) => (
                  <li key={o.id}><Link to={`/orders?order=${o.id}`}><span>{o.docNo} · {day(o.date)}</span><span><StatusBadge status={o.status} />&nbsp;<small>{money(o.total)}</small></span></Link></li>
                ))}
              </ul>
            </>}
            {c.quotes.length > 0 && <>
              <h4>Teklifler</h4>
              <ul className="rows">
                {c.quotes.map((x) => (
                  <li key={x.id}><Link to={`/orders?tab=quotes&quote=${x.id}`}><span>{x.docNo} · {day(x.date)}</span><span><span className={'erp-status ' + x.status}>{QUOTE_STATUS_LABEL[x.status]}</span>&nbsp;<small>{money(x.total)}</small></span></Link></li>
                ))}
              </ul>
            </>}
          </>
        )}
      </aside>
      {preview && c && <EDocumentPreview customerCode={c.code} docNo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
