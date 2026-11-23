import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { sortedPeople, usePeople } from '../lib/people';
import { CustomerPicker } from '../components/CustomerPicker';
import { FeedCard } from '../components/feed/FeedCard';
import { FeedSide } from '../components/feed/FeedSide';
import { ActivityModal } from '../components/feed/ActivityModal';
import type { FeedItem, FeedPage as FeedPageData } from '../lib/types-feed';
import '../styles/feed.css';

const SCOPE_SUB = { own: 'Kendi akışın', department: 'Biriminin akışı', all: 'Tüm ekibin akışı' } as const;

/**
 * Haber akışı: paylaşımlar ve modül olaylarından (görev tamamlandı, sipariş/teklif/sevkiyat) oluşan kartlar.
 * Personel yalnız kendi akışını, yönetici (feed.read: all) herkesin akışını görür; kapsamı API uygular.
 */
export function FeedPage() {
  const people = usePeople();
  const [userId, setUserId] = useState('');
  const path = `/feed${userId ? `?userId=${userId}` : ''}`;
  const { data, setData, reload, loading, error } = useApi<FeedPageData>(path);
  const [older, setOlder] = useState<{ path: string; items: FeedItem[]; hasMore: boolean }>({ path, items: [], hasMore: true });
  const [activityFor, setActivityFor] = useState<FeedItem | null>(null);

  // Filtre değişince eski sayfalar atılır (yalnız aynı filtrenin sayfaları birleştirilir).
  const extra = older.path === path ? older : { path, items: [], hasMore: true };
  const firstIds = new Set((data?.items ?? []).map((i) => i.id));
  const items = [...(data?.items ?? []), ...extra.items.filter((i) => !firstIds.has(i.id))];
  const hasMore = extra.items.length ? extra.hasMore : !!data?.hasMore;
  const scope = data?.scope ?? 'own';

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const page = await api<FeedPageData>(`${path}${path.includes('?') ? '&' : '?'}before=${last.id}`);
    setOlder({ path, items: [...extra.items, ...page.items], hasMore: page.hasMore });
  };

  /** Kart değişikliği ilk sayfaya ve sonradan yüklenen sayfalara aynı şekilde uygulanır. */
  const patch = (fn: (list: FeedItem[]) => FeedItem[]) => {
    if (data) setData({ ...data, items: fn(data.items) });
    setOlder({ ...extra, items: fn(extra.items) });
  };
  const replace = (next: FeedItem) => patch((list) => list.map((i) => (i.id === next.id ? next : i)));
  const removed = (id: number) => patch((list) => list.filter((i) => i.id !== id));

  const team = sortedPeople(people);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Akış</h1>
          <p className="sub">{SCOPE_SUB[scope]} · müşteri görüşmeleri, durum güncellemeleri ve iş hareketleri</p>
        </div>
        {scope !== 'own' && (
          <select className="fd-filter" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Kişiye göre süz">
            <option value="">Herkes</option>
            {team.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        )}
      </div>

      <div className="fd-layout">
        <div className="fd-stream">
          <Composer onPosted={() => void reload()} />
          {error && <p className="error">{error}</p>}
          {loading && !data && <p className="empty">Yükleniyor…</p>}
          {data && items.length === 0 && <p className="empty fd-empty">Akışta henüz bir şey yok. İlk paylaşımı sen yap.</p>}
          {items.map((item) => (
            <FeedCard key={item.id} item={item} onChange={replace} onRemoved={removed} onAddActivity={setActivityFor} />
          ))}
          {hasMore && items.length > 0 && <button className="btn ghost fd-more" onClick={() => void loadMore()}>Daha eski kartlar</button>}
        </div>
        <FeedSide />
      </div>

      {activityFor && <ActivityModal item={activityFor} onClose={() => setActivityFor(null)} onCreated={() => void reload()} />}
    </>
  );
}

function Composer({ onPosted }: { onPosted(): void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reset = () => { setOpen(false); setBody(''); setCustomer(''); setErr(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await api('/feed', json('POST', { body: body.trim(), customerCode: customer.trim() || null }));
      reset();
      onPosted();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Paylaşılamadı'); } finally { setBusy(false); }
  };

  return (
    <form className={'glass fd-composer' + (open ? ' open' : '')} onSubmit={(e) => void submit(e)}>
      <textarea rows={open ? 3 : 1} maxLength={4000} value={body} onFocus={() => setOpen(true)} onChange={(e) => setBody(e.target.value)}
        placeholder="Bir şeyler paylaş: Müşteri görüşme notu, durum güncellemesi veya bir fikir…" />
      {open && (
        <div className="fd-composer__bar">
          <label className="fd-cust">Firma <CustomerPicker value={customer} onChange={setCustomer} /></label>
          <span className="fd-spacer" />
          <button type="button" className="btn ghost sm" onClick={reset}>Vazgeç</button>
          <button className="btn primary sm" disabled={!body.trim() || busy}>Paylaş</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </form>
  );
}
