import { useState, type FormEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import type { FileRef } from '../../lib/types-workflow';
import type { FeedItem, FeedPage } from '../../lib/types-feed';
import { Avatar } from '../Avatar';
import { AttachmentPicker } from '../AttachmentPicker';
import { FeedCard } from './FeedCard';
import { ActivityModal } from './ActivityModal';
import '../../styles/feed.css';

type Tab = 'wall' | 'history';
const PATH: Record<Tab, string> = { wall: '/feed?wall=1', history: '/feed' };

/**
 * Ana sayfadaki şirket panosu (Instagram/Facebook benzeri): herkesin gördüğü fotoğraflı paylaşımlar,
 * beğeni ve yorum. "Tarihçe" sekmesi iş hareketlerini (görev tamamlandı, sipariş, teklif ...) zaman çizelgesi olarak gösterir.
 */
export function SocialWall() {
  const [tab, setTab] = useState<Tab>('wall');
  const path = PATH[tab];
  const { data, setData, reload, loading, error } = useApi<FeedPage>(path);
  const [older, setOlder] = useState<{ path: string; items: FeedItem[]; hasMore: boolean }>({ path, items: [], hasMore: true });
  const [activityFor, setActivityFor] = useState<FeedItem | null>(null);

  const extra = older.path === path ? older : { path, items: [], hasMore: true };
  const firstIds = new Set((data?.items ?? []).map((i) => i.id));
  const items = [...(data?.items ?? []), ...extra.items.filter((i) => !firstIds.has(i.id))];
  const hasMore = extra.items.length ? extra.hasMore : !!data?.hasMore;

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const page = await api<FeedPage>(`${path}${path.includes('?') ? '&' : '?'}before=${last.id}`);
    setOlder({ path, items: [...extra.items, ...page.items], hasMore: page.hasMore });
  };
  const patch = (fn: (list: FeedItem[]) => FeedItem[]) => {
    if (data) setData({ ...data, items: fn(data.items) });
    setOlder({ ...extra, items: fn(extra.items) });
  };

  return (
    <section className="hm-wall" aria-label="Şirket panosu">
      <header className="hm-wall__head">
        <div><h3>Şirket panosu</h3><p className="hm-card__sub">{tab === 'wall' ? 'Paylaş, beğen, yorum yap' : 'Ekipte olan biten'}</p></div>
        <div className="seg sm" role="tablist">
          <button role="tab" aria-selected={tab === 'wall'} className={tab === 'wall' ? 'on' : ''} onClick={() => setTab('wall')}>Pano</button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Tarihçe</button>
        </div>
      </header>
      {tab === 'wall' && <WallComposer onPosted={() => void reload()} />}
      {error && <p className="error">{error}</p>}
      {loading && !data && <p className="empty">Yükleniyor…</p>}
      {data && items.length === 0 && <p className="empty fd-empty">{tab === 'wall' ? 'Panoda henüz paylaşım yok. İlk paylaşımı sen yap.' : 'Henüz kayıt yok.'}</p>}
      <div className="hm-wall__stream">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} onAddActivity={setActivityFor}
            onChange={(next) => patch((list) => list.map((i) => (i.id === next.id ? next : i)))}
            onRemoved={(id) => patch((list) => list.filter((i) => i.id !== id))} />
        ))}
      </div>
      {hasMore && items.length > 0 && <button className="btn ghost fd-more" onClick={() => void loadMore()}>Daha eski paylaşımlar</button>}
      {activityFor && <ActivityModal item={activityFor} onClose={() => setActivityFor(null)} onCreated={() => void reload()} />}
    </section>
  );
}

function WallComposer({ onPosted }: { onPosted(): void }) {
  const { me } = useAuth();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canPost = (body.trim() || files.length) && !busy;

  const reset = () => { setBody(''); setFiles([]); setOpen(false); setErr(''); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    setBusy(true); setErr('');
    try {
      await api('/feed', json('POST', { body: body.trim(), wall: true, attachmentIds: files.map((f) => f.id) }));
      reset();
      onPosted();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Paylaşılamadı'); } finally { setBusy(false); }
  };

  return (
    <form className={'glass fd-composer wall-composer' + (open ? ' open' : '')} onSubmit={(e) => void submit(e)}>
      <div className="wall-composer__row">
        <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} />
        <textarea rows={open ? 3 : 1} maxLength={4000} value={body} onFocus={() => setOpen(true)} onChange={(e) => setBody(e.target.value)}
          placeholder={`Ne düşünüyorsun, ${me!.fullName.split(' ')[0]}?`} />
        {!open && <button type="button" className="icon-btn" title="Fotoğraf ekle" onClick={() => setOpen(true)}><ImagePlus size={20} /></button>}
      </div>
      {open && (
        <>
          <AttachmentPicker files={files} onAdd={(add) => setFiles((cur) => [...cur, ...add])}
            onRemove={(x) => setFiles((cur) => cur.filter((y) => y.id !== x.id))} />
          <div className="fd-composer__bar">
            <span className="fd-spacer" />
            <button type="button" className="btn ghost sm" onClick={reset}>Vazgeç</button>
            <button className="btn primary sm" disabled={!canPost}>{busy ? 'Paylaşılıyor…' : 'Paylaş'}</button>
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </form>
  );
}
