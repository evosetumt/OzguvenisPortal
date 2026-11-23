import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Building2, CheckCircle2, CheckSquare, FileText, MessageSquare, ThumbsUp, Trash2, Truck, X } from 'lucide-react';
import { Avatar } from '../Avatar';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { formatDue, formatTime } from '../../lib/format';
import { safeAppPath } from '../../lib/safe-path';
import type { FeedComment, FeedItem, FeedKind } from '../../lib/types-feed';

const KIND_ICON: Record<Exclude<FeedKind, 'post'>, typeof Banknote> = {
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
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const person = item.author ?? item.owner;
  const isNew = Date.now() - new Date(item.createdAt).getTime() < 6 * 3600_000 && item.author?.id !== me!.id;
  const href = safeAppPath(item.link);
  const SysIcon = item.kind === 'post' ? null : KIND_ICON[item.kind];

  const like = async () => {
    const liked = !item.likedByMe;
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

  return (
    <article className={'glass fd-card' + (SysIcon ? ' is-system' : '')}>
      <header className="fd-head">
        {SysIcon && !item.author ? <span className="fd-sys"><SysIcon size={30} /></span> : (
          // Görevi açan/tamamlayan kişinin fotoğrafı; olay türü köşede küçük rozet olarak gösterilir.
          <span className="fd-av">
            <Avatar id={person?.id} name={person?.fullName ?? '?'} src={person?.avatarUrl} size="lg" />
            {SysIcon && <i className={'fd-badge ' + item.kind}><SysIcon size={14} /></i>}
          </span>
        )}
        <div className="fd-meta">
          <b className="fd-who">{isNew && <span className="fd-new">Yeni</span>}{person?.fullName ?? 'Sistem'}</b>
          {item.customerName || item.customerCode ? (
            <span className="fd-line">
              <Building2 size={14} />
              {can('account.read') && item.customerCode
                ? <Link to={`/accounts?code=${encodeURIComponent(item.customerCode)}`}>{item.customerName ?? item.customerCode}</Link>
                : <span>{item.customerName ?? item.customerCode}</span>}
            </span>
          ) : null}
          {item.relatedLabel && (href ? <Link className="fd-rel" to={href}>{item.relatedLabel}</Link> : <span className="fd-rel">{item.relatedLabel}</span>)}
          <small>{feedWhen(item.createdAt)}</small>
        </div>
        {item.canDelete && <button className="icon-btn sm fd-del" title="Kartı sil" onClick={() => void remove()} disabled={busy}><Trash2 size={15} /></button>}
      </header>

      <p className="fd-body">{item.body}</p>

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

      <footer className="fd-actions">
        <button className={item.likedByMe ? 'on' : ''} onClick={() => void like()} title={item.likers.join(', ') || undefined}>
          <ThumbsUp size={15} /> Beğen{item.likeCount > 0 && <span className="fd-count">{item.likeCount}</span>}
        </button>
        <button onClick={() => setCommenting((v) => !v)}>
          <MessageSquare size={15} /> Yorum yaz{item.comments.length > 0 && <span className="fd-count">{item.comments.length}</span>}
        </button>
        {can('task.write') && <button onClick={() => onAddActivity(item)}><CheckSquare size={15} /> Aktivite ekle</button>}
      </footer>

      {(item.comments.length > 0 || commenting) && (
        <div className="fd-comments">
          {item.comments.map((c) => (
            <div key={c.id} className="fd-comment">
              <Avatar id={c.user.id} name={c.user.fullName} src={c.user.avatarUrl} size="sm" />
              <div><b>{c.user.fullName}</b> <small>{feedWhen(c.createdAt)}</small><p>{c.body}</p></div>
              {(c.user.id === me!.id || item.canDelete) && (
                <button className="icon-btn sm" title="Yorumu sil" onClick={() => void removeComment(c)}><X size={14} /></button>
              )}
            </div>
          ))}
          {commenting && (
            <form className="fd-reply" onSubmit={(e) => void sendComment(e)}>
              <input autoFocus value={draft} maxLength={2000} placeholder="Yorumunuzu yazın…" onChange={(e) => setDraft(e.target.value)} />
              <button className="btn primary sm" disabled={!draft.trim() || busy}>Gönder</button>
            </form>
          )}
        </div>
      )}
      {err && <p className="error fd-err">{err}</p>}
    </article>
  );
}
