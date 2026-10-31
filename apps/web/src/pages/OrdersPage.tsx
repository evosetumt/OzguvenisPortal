import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Package, Truck } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Modal } from '../components/Modal';
import {
  ORDER_STATUS_LABEL, QUOTE_STATUS_LABEL, SHIP_TYPE_LABEL, day, money, qty,
  type ErpSummary, type Order, type OrderDetail, type Quote, type QuoteDetail, type Shipment,
} from '../lib/types-erp';
import '../styles/erp.css';

type Tab = 'orders' | 'quotes' | 'shipments';
const TABS: { key: Tab; label: string; perm: string; icon: typeof FileText }[] = [
  { key: 'orders', label: 'Siparişler', perm: 'order.read', icon: Package },
  { key: 'quotes', label: 'Teklifler', perm: 'quote.read', icon: FileText },
  { key: 'shipments', label: 'Sevkiyatlar', perm: 'shipment.read', icon: Truck },
];

/** Netsis'ten senkronlanan sipariş, teklif ve sevkiyatlar (salt okunur). */
export function OrdersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => can(t.perm));
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? tabs[0]?.key) as Tab | undefined;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [qd, setQd] = useState(q.trim());
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { const h = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(h); }, [q]);
  useEffect(() => { const pq = params.get('q'); if (pq !== null) setQ(pq); }, [params]);

  const setParam = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };
  const switchTab = (t: Tab) => { setStatus(''); setKind(t === 'shipments' ? '' : 'sales'); setParam({ tab: t, q: null, order: null, quote: null }); setQ(''); };

  const query = new URLSearchParams();
  if (qd) query.set('q', qd);
  if (status) query.set('status', status);
  if (kind) query.set('kind', kind);
  if (from) query.set('from', new Date(from).toISOString());
  if (to) { const d = new Date(to); d.setDate(d.getDate() + 1); query.set('to', d.toISOString()); }

  const { data: summary } = useApi<ErpSummary>(can('report.read') ? '/erp/reports/summary' : null);
  const orderId = Number(params.get('order')) || null;
  const quoteId = Number(params.get('quote')) || null;

  if (!tab) return <><h1>Sipariş / Teklif</h1><p className="sub">Bu bölüm için yetkiniz yok.</p></>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sipariş / Teklif</h1>
          <p className="sub">Netsis'ten salt okunur aktarılır; değişiklikler Netsis'te yapılır.</p>
        </div>
      </div>

      {summary && (
        <div className="stats">
          <div className="glass stat"><small>Açık sipariş</small><b>{summary.openOrders.count}</b><small>{money(summary.openOrders.total)}</small></div>
          <div className="glass stat"><small>Bu ay sipariş</small><b>{summary.monthOrders.count}</b><small>{money(summary.monthOrders.total)}</small></div>
          <div className="glass stat"><small>Açık teklif</small><b>{summary.openQuotes.count}</b><small>{money(summary.openQuotes.total)}</small></div>
          <div className="glass stat"><small>Bu ay sevk</small><b>{summary.monthShipments}</b></div>
          <div className="glass stat"><small>Vadesi geçmiş alacak</small><b className={summary.overdueTotal ? 'danger' : ''}>{money(summary.overdueTotal)}</b></div>
        </div>
      )}

      <div className="glass toolbar">
        <div className="seg" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => switchTab(key)}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
        <input className="grow" placeholder="Belge no, cari kodu veya ünvan…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ara" />
        {tab === 'orders' && (
          <>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Sipariş türü">
              <option value="sales">Müşteri siparişleri</option>
              <option value="purchase">Satıcı siparişleri</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
              <option value="">Tüm durumlar</option>
              <option value="active">Açık + kısmi</option>
              {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </>
        )}
        {tab === 'quotes' && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
            <option value="">Tüm durumlar</option>
            {Object.entries(QUOTE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {tab === 'shipments' && (
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Belge türü">
            <option value="">İrsaliye + fatura</option>
            <option value="waybill">İrsaliye</option>
            <option value="invoice">Fatura</option>
          </select>
        )}
        <label className="date-range"><small>Tarih</small>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bitiş" />
        </label>
      </div>

      {tab === 'orders' && <OrdersTable query={query.toString()} onOpen={(id) => setParam({ order: String(id) })} />}
      {tab === 'quotes' && <QuotesTable query={query.toString()} onOpen={(id) => setParam({ quote: String(id) })} />}
      {tab === 'shipments' && <ShipmentsTable query={query.toString()} />}

      {orderId && <OrderModal id={orderId} onClose={() => setParam({ order: null })} />}
      {quoteId && <QuoteModal id={quoteId} onClose={() => setParam({ quote: null })} />}
    </>
  );
}

function OrdersTable({ query, onOpen }: { query: string; onOpen(id: number): void }) {
  const { data, error, loading } = useApi<Order[]>(`/erp/orders?${query}`);
  return (
    <div className="glass table-wrap">
      {error && <p className="error panel">{error}</p>}
      <table className="table">
        <thead><tr><th>Belge no</th><th>Cari</th><th>Tarih</th><th>Durum</th><th>Sevk</th><th className="num">Tutar</th><th>Vade</th><th>Plasiyer</th></tr></thead>
        <tbody>
          {data?.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(o.id)}>
              <td><b>{o.docNo}</b></td>
              <td><CustomerCell code={o.customerCode} name={o.customerName} /></td>
              <td>{day(o.date)}</td>
              <td><StatusBadge status={o.status} /></td>
              <td><ShipProgress shipped={o.shippedQty} total={o.totalQty} /></td>
              <td className="num">{money(o.total)}</td>
              <td>{day(o.dueDate)}</td>
              <td>{o.repCode ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !error && data?.length === 0 && <p className="empty panel">Kayıt yok.</p>}
      {data?.length === 300 && <p className="empty panel">İlk 300 kayıt gösteriliyor; filtreyi daraltın.</p>}
    </div>
  );
}

function QuotesTable({ query, onOpen }: { query: string; onOpen(id: number): void }) {
  const { data, error, loading } = useApi<Quote[]>(`/erp/quotes?${query}`);
  return (
    <div className="glass table-wrap">
      {error && <p className="error panel">{error}</p>}
      <table className="table">
        <thead><tr><th>Teklif no</th><th>Cari</th><th>Tarih</th><th>Durum</th><th className="num">Tutar</th><th>Açıklama</th><th>Plasiyer</th></tr></thead>
        <tbody>
          {data?.map((x) => (
            <tr key={x.id} onClick={() => onOpen(x.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(x.id)}>
              <td><b>{x.docNo}</b></td>
              <td><CustomerCell code={x.customerCode} name={x.customerName} /></td>
              <td>{day(x.date)}</td>
              <td><span className={'erp-status ' + x.status}>{QUOTE_STATUS_LABEL[x.status]}</span></td>
              <td className="num">{money(x.total)}</td>
              <td>{x.description ?? '—'}</td>
              <td>{x.repCode ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !error && data?.length === 0 && <p className="empty panel">Kayıt yok.</p>}
    </div>
  );
}

function ShipmentsTable({ query }: { query: string }) {
  const { data, error, loading } = useApi<Shipment[]>(`/erp/shipments?${query}`);
  return (
    <div className="glass table-wrap">
      {error && <p className="error panel">{error}</p>}
      <table className="table static">
        <thead><tr><th>Belge no</th><th>Tür</th><th>Cari</th><th>Tarih</th><th>Siparişler</th><th className="num">Tutar</th></tr></thead>
        <tbody>
          {data?.map((s) => (
            <tr key={s.id}>
              <td><b>{s.docNo}</b></td>
              <td>{SHIP_TYPE_LABEL[s.docType]}</td>
              <td><CustomerCell code={s.customerCode} name={s.customerName} /></td>
              <td>{day(s.date)}</td>
              <td>{s.orderNos?.split(',').map((n) => <Link key={n} className="link-btn" to={`/orders?tab=orders&q=${encodeURIComponent(n)}`}>{n}</Link>) ?? '—'}</td>
              <td className="num">{money(s.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !error && data?.length === 0 && <p className="empty panel">Kayıt yok.</p>}
    </div>
  );
}

function OrderModal({ id, onClose }: { id: number; onClose(): void }) {
  const { data: o, error } = useApi<OrderDetail>(`/erp/orders/${id}`);
  return (
    <Modal title={o ? `Sipariş ${o.docNo}` : 'Sipariş'} onClose={onClose} wide>
      {error && <p className="error">{error}</p>}
      {o && (
        <>
          <dl className="props erp-props">
            <dt>Cari</dt><dd><CustomerCell code={o.customerCode} name={o.customerName} /></dd>
            <dt>Tür</dt><dd>{o.kind === 'sales' ? 'Müşteri siparişi' : 'Satıcı siparişi'}</dd>
            <dt>Tarih</dt><dd>{day(o.date)}{o.dueDate && <> · vade {day(o.dueDate)}</>}</dd>
            <dt>Durum</dt><dd><StatusBadge status={o.status} /> <ShipProgress shipped={o.shippedQty} total={o.totalQty} /></dd>
            <dt>Tutar</dt><dd>{money(o.gross)} + KDV {money(o.vat)} = <b>{money(o.total)}</b></dd>
            {o.description && <><dt>Açıklama</dt><dd>{o.description}</dd></>}
            <dt>Plasiyer</dt><dd>{o.repCode ?? '—'}</dd>
          </dl>
          <Items items={o.items} showShipped />
          <h4>Sevkiyatlar</h4>
          {o.shipments.length ? (
            <ul className="rows">
              {o.shipments.map((s) => <li key={s.id} className="row-line"><span>{SHIP_TYPE_LABEL[s.docType]} {s.docNo}</span><small>{day(s.date)} · {money(s.total)}</small></li>)}
            </ul>
          ) : <p className="empty">Henüz sevk yok.</p>}
          <LinkedTasks tasks={o.tasks} />
        </>
      )}
    </Modal>
  );
}

function QuoteModal({ id, onClose }: { id: number; onClose(): void }) {
  const { data: x, error } = useApi<QuoteDetail>(`/erp/quotes/${id}`);
  return (
    <Modal title={x ? `Teklif ${x.docNo}` : 'Teklif'} onClose={onClose} wide>
      {error && <p className="error">{error}</p>}
      {x && (
        <>
          <dl className="props erp-props">
            <dt>Cari</dt><dd><CustomerCell code={x.customerCode} name={x.customerName} /></dd>
            <dt>Tarih</dt><dd>{day(x.date)}</dd>
            <dt>Durum</dt><dd><span className={'erp-status ' + x.status}>{QUOTE_STATUS_LABEL[x.status]}</span></dd>
            <dt>Tutar</dt><dd>{money(x.gross)} + KDV {money(x.vat)} = <b>{money(x.total)}</b></dd>
            {x.description && <><dt>Açıklama</dt><dd>{x.description}</dd></>}
            <dt>Plasiyer</dt><dd>{x.repCode ?? '—'}</dd>
          </dl>
          <Items items={x.items} />
          <LinkedTasks tasks={x.tasks} />
        </>
      )}
    </Modal>
  );
}

function Items({ items, showShipped }: { items: OrderDetail['items']; showShipped?: boolean }) {
  return (
    <>
      <h4>Kalemler</h4>
      <div className="table-wrap">
        <table className="table static">
          <thead><tr><th>Stok</th><th className="num">Miktar</th>{showShipped && <th className="num">Sevk</th>}<th className="num">Birim fiyat</th><th className="num">KDV %</th><th className="num">Tutar</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td><b>{it.stockName ?? it.stockCode}</b><br /><small>{it.stockCode}</small></td>
                <td className="num">{qty(it.qty)} {it.unit ?? ''}</td>
                {showShipped && <td className="num">{qty(it.shippedQty ?? 0)}</td>}
                <td className="num">{money(it.unitPrice)}</td>
                <td className="num">{it.vatRate}</td>
                <td className="num">{money(it.qty * it.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <p className="empty">Kalem yok.</p>}
    </>
  );
}

function LinkedTasks({ tasks }: { tasks: { id: number; title: string }[] }) {
  if (!tasks.length) return null;
  return (
    <>
      <h4>Bu belgeyle tamamlanan iş emirleri</h4>
      <ul className="rows">{tasks.map((t) => <li key={t.id}><Link to={`/tasks?id=${t.id}`}><span>{t.title}</span></Link></li>)}</ul>
    </>
  );
}

export function CustomerCell({ code, name }: { code: string; name: string | null }) {
  const { can } = useAuth();
  const body = <><span>{name ?? code}</span>{name && <small> {code}</small>}</>;
  return can('account.read')
    ? <Link className="customer-link" to={`/accounts?code=${encodeURIComponent(code)}`} onClick={(e) => e.stopPropagation()}>{body}</Link>
    : <span>{body}</span>;
}

export function StatusBadge({ status }: { status: Order['status'] }) {
  return <span className={'erp-status ' + status}>{ORDER_STATUS_LABEL[status]}</span>;
}

function ShipProgress({ shipped, total }: { shipped: number; total: number }) {
  if (!total) return <small>—</small>;
  const pct = Math.min(100, Math.round((shipped / total) * 100));
  return (
    <span className="progress ship" title={`${qty(shipped)} / ${qty(total)}`}>
      <span><i style={{ width: `${pct}%` }} /></span><small>%{pct}</small>
    </span>
  );
}
