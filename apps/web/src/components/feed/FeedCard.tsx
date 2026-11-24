import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Building2, CheckCircle2, CheckSquare, FileText, Heart, MessageCircle, SendHorizontal, Trash2, Truck, X } from 'lucide-react';
import { Avatar } from '../Avatar';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { formatDue, formatTime } from '../../lib/format';
import { safeAppPath } from '../../lib/safe-path';
import type { FeedComment, FeedFile, FeedItem, FeedKind } from '../../lib/types-feed';
import { fileUrl, openFile } from '../../lib/files';
import { Receipt } from '../workflow/Receipt';

const KIND_ICON: Record<Exclude<FeedKind, 'post' | 'social'>, typeof Banknote> = {
  task_created: CheckSquare, task_completed: CheckCircle2, order_created: Banknote, order_status: Banknote, quote_created: FileText, shipment: Truck,
};

/** "Bugün 08:15", "Dün 16:36", "18 Kas 10:02" */
export function feedWhen(iso: string) {
  const d = new Date(iso), t = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(t) - day(d)) / 86400000);
  const prefix = diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
  return `${prefix} ${formatTime(iso)}`;
}

interface Props {
  item: FeedItem;
  onChange(next: FeedItem): void;
  onRemoved(id: number): void;
  onAddActivity(item: FeedItem): void;
}

export function FeedCard({ item, onChange, onRemoved, onAddActivity }: Props) {
  const { me, can } = useAuth();
  const [commenting, setCommenting] = useState(false);
  const [allComments, setAllComments] = useState(false);
  const [pop, setPop] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const person = item.author ?? item.owner;
  const isNew = Date.now() - new Date(item.createdAt).getTime() < 6 * 3600_000 && item.author?.id !== me!.id;
  const href = safeAppPath(item.link);
  const SysIcon = item.kind === 'post' || item.kind === 'social' ? null : KIND_ICON[item.kind];

  const like = async () => {
    const liked = !item.likedByMe;
    setPop(liked); // beğenince kalp kısa bir "zıplama" yapar
    onChange({ ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) });
    try { await api(`/feed/${item.id}/like`, json('POST')); } catch { onChange(item); }
  };

  const sendComment = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    try {
      const c = await api<FeedComment>(`/feed/${item.id}/comments`, json('POST', { body }));
      onChange({ ...item, comments: [...item.comments, c] });
      setDraft('');
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Yorum gönderilemedi'); } finally { setBusy(false); }
  };

  const removeComment = async (c: FeedComment) => {
    onChange({ ...item, comments: item.comments.filter((x) => x.id !== c.id) });
    try { await api(`/feed/${item.id}/comments/${c.id}`, json('DELETE')); } catch { onChange(item); }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try { await api(`/feed/${item.id}`, json('DELETE')); onRemoved(item.id); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Silinemedi'); setBusy(false); }
  };

  const comments = allComments ? item.comments : item.comments.slice(-VISIBLE_COMMENTS);
  const hiddenComments = item.comments.length - comments.length;
  const likeText = item.likers.length
    ? `${item.likers[0]}${item.likeCount > 1 ? ` ve ${item.likeCount - 1} kişi` : ''}`
    : `${item.likeCount} beğeni`;

  return (
    <article className={'fd-card' + (SysIcon ? ' is-system k-' + item.kind : ' is-post')}>
      <header className="fd-head">
        {SysIcon && !item.author ? <span className={'fd-sys k-' + item.kind}><SysIcon size={22} /></span> : (
          // Görevi açan/tamamlayan kişinin fotoğrafı; olay türü köşede küçük rozet olarak gösterilir.
          <span className="fd-av">
            <Avatar id={person?.id} name={person?.fullName ?? '?'} src={person?.avatarUrl} />
            {SysIcon && <i className={'fd-badge k-' + item.kind}><SysIcon size={12} /></i>}
          </span>
        )}
        <div className="fd-meta">
          <b className="fd-who">{person?.fullName ?? 'Sistem'}{isNew && <span className="fd-new">Yeni</span>}</b>
          <span className="fd-sub">
            <small>{feedWhen(item.createdAt)}</small>
            {(item.customerName || item.customerCode) && (
              <span className="fd-chip">
                <Building2 size={12} />
                {can('account.read') && item.customerCode
                  ? <Link to={`/accounts?code=${encodeURIComponent(item.customerCode)}`}>{item.customerName ?? item.customerCode}</Link>
                  : <span>{item.customerName ?? item.customerCode}</span>}
              </span>
            )}
          </span>
        </div>
        {item.canDelete && <button className="icon-btn sm fd-del" title="Kartı sil" onClick={() => void remove()} disabled={busy}><Trash2 size={15} /></button>}
      </header>

      {item.body && <p className={'fd-body' + (isShortPost(item) ? ' is-big' : '')}>{item.body}</p>}
      {item.relatedLabel && (href ? <Link className="fd-rel" to={href}>{item.relatedLabel} →</Link> : <span className="fd-rel">{item.relatedLabel}</span>)}
      {(item.files?.length ?? 0) > 0 && <FeedPhotos files={item.files!} />}

      {item.activities.length > 0 && (
        <ul className="fd-acts">
          {item.activities.map((a) => (
            <li key={a.id} className={a.done ? 'done' : ''}>
              <Link to={`/tasks?id=${a.id}`}><CheckSquare size={14} /> {a.title}</Link>
              <small>{a.assignee ?? ''}{a.dueDate ? ` · ${formatDue(a.dueDate)}` : ''}</small>
            </li>
          ))}
        </ul>
      )}

      {(item.likeCount > 0 || item.comments.length > 0) && (
        <div className="fd-stats">
          {item.likeCount > 0 && <span className="fd-stats__likes" title={item.likers.join(', ')}><i><Heart size={11} /></i>{likeText}</span>}
          <span className="fd-spacer" />
          {item.comments.length > 0 && <button type="button" onClick={() => { setAllComments(true); setCommenting(true); }}>{item.comments.length} yorum</button>}
        </div>
      )}

      <footer className="fd-actions">
        <button className={'fd-like' + (item.likedByMe ? ' on' : '') + (pop ? ' pop' : '')} onClick={() => void like()} onAnimationEnd={() => setPop(false)}
          aria-pressed={item.likedByMe}>
          <Heart size={19} /> Beğen
        </button>
        <button onClick={() => setCommenting((v) => !v)}><MessageCircle size={19} /> Yorum</button>
        {can('task.write') && item.kind !== 'social' && <button onClick={() => onAddActivity(item)}><CheckSquare size={19} /> Aktivite</button>}
      </footer>

      {(item.comments.length > 0 || commenting) && (
        <div className="fd-comments">
          {hiddenComments > 0 && (
            <button type="button" className="fd-comments__more" onClick={() => setAllComments(true)}>Önceki {hiddenComments} yorumu gör</button>
          )}
          {comments.map((c) => (
            <div key={c.id} className="fd-comment">
              <Avatar id={c.user.id} name={c.user.fullName} src={c.user.avatarUrl} size="sm" />
              <div className="fd-bubble">
                <b>{c.user.fullName}</b>
                <p>{c.body}</p>
                <small>{feedWhen(c.createdAt)}</small>
              </div>
              {(c.user.id === me!.id || item.canDelete) && (
                <button className="icon-btn sm" title="Yorumu sil" onClick={() => void removeComment(c)}><X size={14} /></button>
              )}
            </div>
          ))}
          {commenting && (
            <form className="fd-reply" onSubmit={(e) => void sendComment(e)}>
              <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} size="sm" />
              <input autoFocus value={draft} maxLength={2000} placeholder="Yorum yaz…" onChange={(e) => setDraft(e.target.value)} />
              <button className="fd-reply__send" disabled={!draft.trim() || busy} title="Gönder" aria-label="Gönder"><SendHorizontal size={18} /></button>
            </form>
          )}
        </div>
      )}
      {err && <p className="error fd-err">{err}</p>}
    </article>
  );
}

const VISIBLE_COMMENTS = 2;
const BIG_TEXT_MAX = 90;
/** Fotoğrafsız kısa paylaşım büyük puntoyla gösterilir (sosyal medyadaki "durum" yazısı gibi). */
const isShortPost = (i: FeedItem) => (i.kind === 'post' || i.kind === 'social') && !(i.files?.length) && i.body.length <= BIG_TEXT_MAX;

/** Paylaşımdaki fotoğraflar (ızgara) ve diğer dosyalar; dokununca uygulama içi görüntüleyicide açılır. */
function FeedPhotos({ files }: { files: FeedFile[] }) {
  const images = files.filter((f) => f.mime.startsWith('image/') && f.mime !== 'image/heic');
  const docs = files.filter((f) => !images.includes(f));
  return (
    <div className="fd-files">
      {images.length > 0 && (
        <div className={'fd-photos n' + Math.min(images.length, 4)}>
          {images.slice(0, 4).map((f, i) => (
            <FeedImage key={f.id} file={f} more={i === 3 && images.length > 4 ? images.length - 4 : 0} />
          ))}
        </div>
      )}
      {docs.length > 0 && <div className="receipts">{docs.map((f) => <Receipt key={f.id} file={f} />)}</div>}
    </div>
  );
}

function FeedImage({ file, more }: { file: FeedFile; more: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    fileUrl(file.id).then((u) => { url = u; if (alive) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file.id]);
  return (
    <button type="button" className="fd-photo" onClick={() => void openFile(file.id, file.fileName)} aria-label={file.fileName}>
      {src ? <img src={src} alt={file.fileName} loading="lazy" /> : <span className="fd-photo__ph" />}
      {more > 0 && <b className="fd-photo__more">+{more}</b>}
    </button>
  );
}
