import { useState } from 'react';
import { Activity, LayoutGrid, MessageCircleHeart } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/data';
import { sortedPeople, usePeople } from '../lib/people';
import { FeedCard } from '../components/feed/FeedCard';
import { FeedComposer } from '../components/feed/FeedComposer';
import { FeedSide } from '../components/feed/FeedSide';
import { FeedStories } from '../components/feed/FeedStories';
import { ActivityModal } from '../components/feed/ActivityModal';
import type { FeedItem, FeedPage as FeedPageData } from '../lib/types-feed';
import '../styles/feed.css';

const SCOPE_SUB = { own: 'Kendi akışın', department: 'Biriminin akışı', all: 'Tüm ekibin akışı' } as const;

type Tab = 'all' | 'posts' | 'work';
const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
  { key: 'all', label: 'Tümü', icon: LayoutGrid },
  { key: 'posts', label: 'Paylaşımlar', icon: MessageCircleHeart },
  { key: 'work', label: 'İş hareketleri', icon: Activity },
];
const isPost = (i: FeedItem) => i.kind === 'post' || i.kind === 'social';
const TAB_FILTER: Record<Tab, (i: FeedItem) => boolean> = { all: () => true, posts: isPost, work: (i) => !isPost(i) };

/**
 * İş Akışları: sosyal medya tarzı akış. Üstte ekip şeridi (kişiye göre süzer), paylaşım kutusu, sekmeler
 * (Tümü / Paylaşımlar / İş hareketleri) ve kartlar; sağda "Beni bekleyenler / Şimdi aktif".
 * Personel yalnız kendi akışını, yönetici (feed.read: all) herkesin akışını görür; kapsamı API uygular.
 */
export function FeedPage() {
  const people = usePeople();
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const path = `/feed${userId ? `?userId=${userId}` : ''}`;
  const { data, setData, reload, loading, error } = useApi<FeedPageData>(path);
  const [older, setOlder] = useState<{ path: string; items: FeedItem[]; hasMore: boolean }>({ path, items: [], hasMore: true });
  const [activityFor, setActivityFor] = useState<FeedItem | null>(null);

  // Filtre değişince eski sayfalar atılır (yalnız aynı filtrenin sayfaları birleştirilir).
  const extra = older.path === path ? older : { path, items: [], hasMore: true };
  const firstIds = new Set((data?.items ?? []).map((i) => i.id));
  const items = [...(data?.items ?? []), ...extra.items.filter((i) => !firstIds.has(i.id))];
  const shown = items.filter(TAB_FILTER[tab]);
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

  const emptyText = tab === 'posts' ? 'Henüz paylaşım yok. İlk paylaşımı sen yap.'
    : tab === 'work' ? 'Henüz iş hareketi yok.' : 'İş akışında henüz bir şey yok. İlk paylaşımı sen yap.';

  return (
    <>
      <header className="fd-hero">
        <div>
          <p className="fd-hero__kicker">{SCOPE_SUB[scope]}</p>
          <h1>İş Akışları</h1>
          <p className="fd-hero__sub">Paylaş, beğen, yorum yap: müşteri görüşmeleri, başarılar ve iş hareketleri tek akışta.</p>
        </div>
      </header>

      {scope !== 'own' && <FeedStories people={sortedPeople(people)} value={userId} onChange={setUserId} />}

      <div className="fd-layout">
        <div className="fd-stream">
          <FeedComposer onPosted={() => void reload()} />

          <div className="fd-tabs" role="tablist" aria-label="Akış türü">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          {error && <p className="error">{error}</p>}
          {loading && !data && <div className="fd-skeleton" aria-label="Yükleniyor"><span /><span /><span /></div>}
          {data && shown.length === 0 && <p className="empty fd-empty">{emptyText}</p>}
          {shown.map((item) => (
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
