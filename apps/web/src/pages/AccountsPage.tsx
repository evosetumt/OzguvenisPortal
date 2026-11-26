import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, X } from 'lucide-react';
import { useApi } from '../lib/data';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  QUOTE_STATUS_LABEL, day, money,
  type Customer, type CustomerDetail, type CustomerList, type CustomerTypeCount, type ErpSummary,
} from '../lib/types-erp';
import {
  ACCOUNT_SORT_OPTIONS, customerTypeLabel, dateRangeParams, nextSort, toDateInput,
  type AccountSortKey, type SortDirection,
} from '../lib/accounts';
import { StatusBadge } from './OrdersPage';
import { EDocumentPreview } from '../components/EDocumentPreview';
import '../styles/erp.css';
import { useOverlay } from '../lib/overlay-stack';

type SortState = { key: AccountSortKey; dir: SortDirection };
type Range = { from?: string; to?: string };
const balanceClass = (n: number) => (n > 0 ? 'erp-debit' : n < 0 ? 'erp-credit' : '');

/** Netsis cari kartları, bakiyeler ve ekstre (salt okunur). Hariç tutma kişiye özeldir. */
export function AccountsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [debtors, setDebtors] = useState(false);
  const [type, setType] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => { const h = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(h); }, [q]);

  const range = dateRangeParams(from, to);
  const ranged = !!(range.from || range.to);
  const query = new URLSearchParams();
  if (qd) query.set('q', qd);
  if (debtors) query.set('debtors', '1');
  if (type) query.set('type', type);
  if (showExcluded) query.set('excluded', '1');
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  query.set('sort', sort.key);
  query.set('dir', sort.dir);
  const { data, error, loading, reload } = useApi<CustomerList>(`/erp/customers?${query}`);
  const { data: types } = useApi<CustomerTypeCount[]>('/erp/customers/types');
  const { data: summary, reload: reloadSummary } = useApi<ErpSummary>(can('report.read') ? '/erp/reports/summary?exclude=1' : null);
  const code = params.get('code');
  const open = (c: string | null) => {
    const p = new URLSearchParams(params);
    c ? p.set('code', c) : p.delete('code');
    setParams(p, { replace: true });
  };

  /** Hariç tut / geri al; başarılıysa liste ve özet tazelenir. */
  const setExcluded = async (c: string, excluded: boolean) => {
    setActionError('');
    try {
      await api(`/erp/customers/${encodeURIComponent(c)}/exclusion`, { method: excluded ? 'PUT' : 'DELETE' });
      await Promise.all([reload(), reloadSummary()]);
      return true;
    } catch (e) {
      setActionError((e as Error).message || 'İşlem yapılamadı');
      return false;
    }
  };

  const windowStart = data ? toDateInput(new Date(data.windowStart)) : undefined;
  // Önbellek yalnız son N günün hareketlerini tutar; daha eski başlangıçta dönem rakamları eksik kalır
  const beforeWindow = ranged && !!windowStart && (!from || from < windowStart);
  const typeOptions = (types ?? []).filter((t) => t.type);
  const numLabel = (base: string) => (ranged ? `Dönem ${base.toLocaleLowerCase('tr-TR')}` : base);
  const balanceLabel = ranged && range.to ? 'Dönem sonu bakiye' : 'Bakiye';
  const changeSort = (value: string) => {
    const [key, dir] = value.split(':');
    setSort({ key: key as AccountSortKey, dir: dir as SortDirection });
  };
  const clearRange = () => { setFrom(''); setTo(''); };

  return (
    <>
      <h1>Cari Hesaplar</h1>

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
          </section>
        </div>
      )}

      <div className="glass toolbar acc-filters">
        <input className="grow" placeholder="Cari kodu, ünvan veya vergi no…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ara" />
        {typeOptions.length > 0 && (
          <div className="seg acc-types" role="group" aria-label="Cari tipi">
            <button type="button" className={type === '' ? 'on' : ''} aria-pressed={type === ''} onClick={() => setType('')}>Tümü</button>
            {typeOptions.map((t) => (
              <button type="button" key={t.type} className={type === t.type ? 'on' : ''} aria-pressed={type === t.type} onClick={() => setType(t.type!)}>
                {customerTypeLabel(t.type)}
              </button>
            ))}
          </div>
        )}
        <select value={`${sort.key}:${sort.dir}`} aria-label="Sırala" onChange={(e) => changeSort(e.target.value)}>
          {ACCOUNT_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="date-range"><small>Tarih</small>
          <input type="date" value={from} min={windowStart} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç" />
          <input type="date" value={to} min={from || windowStart} onChange={(e) => setTo(e.target.value)} aria-label="Bitiş" />
          {ranged && <button type="button" className="icon-btn sm" title="Tarihi temizle" aria-label="Tarihi temizle" onClick={clearRange}><X size={14} /></button>}
        </label>
        <label className="check"><input type="checkbox" checked={debtors} onChange={(e) => setDebtors(e.target.checked)} /> Yalnız borçlular</label>
        {(showExcluded || (data?.excludedCount ?? 0) > 0) && (
          <label className="check">
            <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} /> Hariç tutulanları göster ({data?.excludedCount ?? 0})
          </label>
        )}
        {data && <small className="acc-count">{data.total} cari{data.total > data.items.length ? ` (ilk ${data.items.length})` : ''}</small>}
      </div>
      {beforeWindow && data && <p className="acc-note">Hareketler {day(data.windowStart)} tarihinden itibaren tutulur; daha eski dönem rakamları eksik olabilir.</p>}
      {actionError && <p className="error">{actionError}</p>}

      {data && (
        <div className="acc-totals" aria-label="Toplamlar">
          <span><small>{numLabel('Borç')}</small>{money(data.totals.debit)}</span>
          <span><small>{numLabel('Alacak')}</small>{money(data.totals.credit)}</span>
          <span><small>{balanceLabel}</small><b className={balanceClass(data.totals.balance)}>{money(data.totals.balance)}</b></span>
        </div>
      )}

      <div className="glass table-wrap acc-list">
        {error && <p className="error panel">{error}</p>}
        <table className="table acc-table">
          <thead><tr>
            <SortHead k="code" label="Kod" sort={sort} onSort={setSort} />
            <SortHead k="name" label="Ünvan" sort={sort} onSort={setSort} />
            <th>Tip</th><th>İl</th><th>Plasiyer</th>
            <SortHead k="debit" label={numLabel('Borç')} num sort={sort} onSort={setSort} />
            <SortHead k="credit" label={numLabel('Alacak')} num sort={sort} onSort={setSort} />
            <SortHead k="balance" label={balanceLabel} num sort={sort} onSort={setSort} />
            <th><span className="sr-only">İşlem</span></th>
          </tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.code} className={c.excluded ? 'is-excluded' : undefined} onClick={() => open(c.code)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(c.code)}>
                <td>{c.code}</td>
                <td><b>{c.name}</b>{c.excluded && <> <span className="tag">Hariç</span></>}</td>
                <td>{c.type ? customerTypeLabel(c.type) : '—'}</td>
                <td>{c.city ?? '—'}</td>
                <td>{c.repCode ?? '—'}</td>
                <td className="num">{money(c.debit)}</td>
                <td className="num">{money(c.credit)}</td>
                <td className={'num ' + balanceClass(c.balance)}><b>{money(c.balance)}</b></td>
                <td className="acc-act"><ExcludeButton c={c} onToggle={setExcluded} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Telefonda tablo yerine kartlar (erp.css → .acc-cards); hariç tutma cari detayından yapılır */}
        <ul className="acc-cards">
          {data?.items.map((c) => (
            <li key={c.code} className={c.excluded ? 'is-excluded' : undefined}>
              <button className="acc-card" onClick={() => open(c.code)}>
                <span className="acc-card__top"><b>{c.name}</b><small>{c.excluded ? 'Hariç · ' : ''}{c.code}</small></span>
                <span className="acc-card__meta">{[c.type && customerTypeLabel(c.type), c.city, c.repCode && `Plasiyer ${c.repCode}`].filter(Boolean).join(' · ') || '—'}</span>
                <span className="acc-card__nums">
                  <span><small>{numLabel('Borç')}</small>{money(c.debit)}</span>
                  <span><small>{numLabel('Alacak')}</small>{money(c.credit)}</span>
                  <span><small>Bakiye</small><b className={balanceClass(c.balance)}>{money(c.balance)}</b></span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && !error && data?.items.length === 0 && <p className="empty panel">Cari bulunamadı.</p>}
      </div>

      {code && <CustomerDrawer code={code} range={range} onClose={() => open(null)} onToggleExcluded={setExcluded} />}
    </>
  );
}

type SortHeadProps = { k: AccountSortKey; label: string; num?: boolean; sort: SortState; onSort(s: SortState): void };

/** Tıklanınca sıralayan sütun başlığı. */
function SortHead({ k, label, num, sort, onSort }: SortHeadProps) {
  const active = sort.key === k;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th className={num ? 'num' : undefined} aria-sort={ariaSort}>
      <button type="button" className={'th-sort' + (active ? ' on' : '')} onClick={() => onSort(nextSort(sort, k))}>
        {label}{active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

function ExcludeButton({ c, onToggle }: { c: Customer; onToggle(code: string, excluded: boolean): Promise<boolean> }) {
  const label = c.excluded ? 'Listeye geri al' : 'Hariç tut';
  return (
    <button type="button" className="icon-btn sm" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); void onToggle(c.code, !c.excluded); }}
      onKeyDown={(e) => e.stopPropagation()}>
      {c.excluded ? <Eye size={15} /> : <EyeOff size={15} />}
    </button>
  );
}

type DrawerProps = { code: string; range: Range; onClose(): void; onToggleExcluded(code: string, excluded: boolean): Promise<boolean> };

function CustomerDrawer({ code, range, onClose, onToggleExcluded }: DrawerProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rq = new URLSearchParams();
  if (range.from) rq.set('from', range.from);
  if (range.to) rq.set('to', range.to);
  const { data: c, error, reload } = useApi<CustomerDetail>(`/erp/customers/${encodeURIComponent(code)}${rq.toString() ? `?${rq}` : ''}`);
  // e-Belge önizlemesi kendi penceresi olarak yığının üstünde durur; Esc/geri önce onu kapatır.
  useOverlay(onClose);

  const toggleExcluded = async () => {
    if (!c) return;
    setBusy(true);
    if (await onToggleExcluded(c.code, !c.excluded)) await reload();
    setBusy(false);
  };
  const p = c?.period;

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer erp-drawer" role="dialog" aria-modal="true" aria-label="Cari detayı">
        <header className="modal-head">
          <h2>{c?.name ?? code}</h2>
          {c && (
            <button type="button" className="btn sm acc-exclude-btn" disabled={busy} onClick={() => void toggleExcluded()}>
              {c.excluded ? <><Eye size={14} /> Listeye geri al</> : <><EyeOff size={14} /> Hariç tut</>}
            </button>
          )}
          <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
        </header>
        {error && <p className="error">{error}</p>}
        {c && (
          <>
            <div className="stats">
              <div className="glass stat"><small>{p ? 'Dönem borç' : 'Borç'}</small><b>{money(p ? p.debit : c.debit)}</b></div>
              <div className="glass stat"><small>{p ? 'Dönem alacak' : 'Alacak'}</small><b>{money(p ? p.credit : c.credit)}</b></div>
              <div className="glass stat"><small>{p ? 'Dönem sonu bakiye' : 'Bakiye'}</small><b className={balanceClass(p ? p.closing : c.balance)}>{money(p ? p.closing : c.balance)}</b></div>
            </div>
            <dl className="props erp-props">
              <dt>Kod</dt><dd>{c.code}</dd>
              {c.type && <><dt>Tip</dt><dd>{customerTypeLabel(c.type)}</dd></>}
              {c.taxNo && <><dt>Vergi</dt><dd>{c.taxOffice ?? ''} {c.taxNo}</dd></>}
              {c.phone && <><dt>Telefon</dt><dd><a href={`tel:${c.phone}`}>{c.phone}</a></dd></>}
              {c.email && <><dt>E-posta</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></>}
              {(c.address || c.city) && <><dt>Adres</dt><dd>{[c.address, c.city].filter(Boolean).join(', ')}</dd></>}
              <dt>Plasiyer</dt><dd>{c.repCode ?? '—'}</dd>
              {p && <><dt>Güncel bakiye</dt><dd><b className={balanceClass(c.balance)}>{money(c.balance)}</b></dd></>}
            </dl>

            <h4>Ekstre</h4>
            <div className="table-wrap">
              <table className="table static statement">
                <thead><tr><th>Tarih</th><th>Belge</th><th>Açıklama</th><th>Vade</th><th className="num">Borç</th><th className="num">Alacak</th><th className="num">Bakiye</th></tr></thead>
                <tbody>
                  <tr className="opening"><td colSpan={6}>{range.from ? `Devir (${day(range.from)} öncesi)` : 'Devir (önceki dönem)'}</td><td className="num" data-label="Bakiye">{money(c.opening)}</td></tr>
                  {c.statement.map((x) => (
                    <tr key={x.id}>
                      <td className="st-date">{day(x.date)}</td>
                      <td className="st-doc">{x.eDoc && x.docNo
                        ? <button className="link-btn edoc-link" title="e-Belge önizlemesi" onClick={() => setPreview(x.docNo)}><FileText size={13} /> {x.docNo}</button>
                        : x.docNo ?? '—'}</td>
                      <td className="st-desc">{x.description ?? '—'}</td>
                      <td className={'st-due' + (x.dueDate && x.debit > 0 && new Date(x.dueDate) < new Date() ? ' danger' : '')} data-label="Vade">{day(x.dueDate)}</td>
                      <td className="num" data-label="Borç">{x.debit ? money(x.debit) : ''}</td>
                      <td className="num" data-label="Alacak">{x.credit ? money(x.credit) : ''}</td>
                      <td className="num" data-label="Bakiye">{money(x.balance)}</td>
                    </tr>
                  ))}
                  {c.statement.length === 0 && <tr><td colSpan={7} className="empty">Bu dönemde hareket yok.</td></tr>}
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
