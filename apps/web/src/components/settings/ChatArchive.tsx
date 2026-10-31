import { useEffect, useState } from 'react';
import { History, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { formatTime, initials } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import type { ArchiveConversation, ArchiveMessage } from '../../lib/types-chat';
import { AttachmentView } from '../chat/MessageThread';
import '../../styles/chat.css';

const PAGE = 50;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const titleOf = (c: ArchiveConversation) => (c.type === 'group' ? c.title ?? 'Grup' : c.members.map((m) => m.fullName).join(' ↔ '));

/**
 * Sohbet arşivi (chat.audit): tüm sohbetler, silinen mesajların içeriği, düzenleme öncesi metinler.
 * Silinen mesaj "Geri getir" ile sohbet üyelerinde yeniden görünür. Arşiv görüntülemesi sohbet üyelerine bildirilmez.
 */
export function ChatArchive() {
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [query, setQuery] = useState('');
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const { data: convs, error } = useApi<ArchiveConversation[]>(`/chat/admin/conversations?${query}`);
  const [activeId, setActiveId] = useState<number | null>(null);

  // Arama kutusu yazarken her harfte sorgu atmasın.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (userId) p.set('userId', userId);
      setQuery(p.toString());
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, userId]);

  const active = convs?.find((c) => c.id === activeId) ?? null;

  return (
    <section className="glass panel archive">
      <h3>Sohbet arşivi</h3>
      <p className="hint">
        Tüm sohbetler ve kullanıcıların sildiği mesajlar burada saklanır. Silinen mesajı geri getirdiğinizde sohbetteki herkes yeniden görür.
        Düzenlenen mesajların önceki halleri de listelenir.
      </p>
      <div className="archive-filters">
        <label className="chat-search"><Search size={14} /><input placeholder="Grup adı veya kişi ara…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Kişiye göre">
          <option value="">Tüm kişiler</option>
          {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className={'archive-body' + (active ? ' has-active' : '')}>
        <ul className="archive-list">
          {convs && convs.length === 0 && <li className="empty">Sohbet bulunamadı.</li>}
          {(convs ?? []).map((c) => (
            <li key={c.id}>
              <button className={'conv' + (c.id === activeId ? ' active' : '')} onClick={() => setActiveId(c.id)}>
                <span className="avatar">{c.type === 'group' ? '#' : initials(c.members[0]?.fullName ?? '?')}</span>
                <span className="conv-body">
                  <span className="conv-top"><b>{titleOf(c)}</b>{c.lastMessageAt && <small>{fmtDate(c.lastMessageAt)}</small>}</span>
                  <span className="conv-bottom">
                    <small>{c.messageCount} mesaj{c.type === 'group' && ` · ${c.members.length} üye`}</small>
                    {c.deletedCount > 0 && <span className="tag danger"><Trash2 size={11} /> {c.deletedCount} silinmiş</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {active
          ? <ArchiveThread key={active.id} conv={active} onBack={() => setActiveId(null)} />
          : <p className="empty archive-placeholder">Bir sohbet seçin.</p>}
      </div>
    </section>
  );
}

function ArchiveThread({ conv, onBack }: { conv: ArchiveConversation; onBack(): void }) {
  const [msgs, setMsgs] = useState<ArchiveMessage[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [onlyDeleted, setOnlyDeleted] = useState(false);

  const load = async (before?: number) => {
    try {
      const r = await api<{ messages: ArchiveMessage[] }>(`/chat/admin/conversations/${conv.id}/messages?take=${PAGE}${before ? `&before=${before}` : ''}`);
      setMsgs((xs) => [...(before ? xs ?? [] : []), ...r.messages]);
      setMore(r.messages.length === PAGE);
    } catch (e) { setError(e instanceof Error ? e.message : 'Yüklenemedi'); }
  };
  useEffect(() => { void load(); }, [conv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (m: ArchiveMessage) => {
    try {
      const r = await api<ArchiveMessage>(`/chat/admin/messages/${m.id}/restore`, json('POST'));
      setMsgs((xs) => xs && xs.map((x) => (x.id === m.id ? { ...x, deletedAt: r.deletedAt } : x)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Geri getirilemedi'); }
  };

  // Liste yeniden eskiye gelir; ekranda eskiden yeniye gösterilir.
  const shown = [...(msgs ?? [])].reverse().filter((m) => !onlyDeleted || m.deletedAt || m.revisions.length);

  return (
    <div className="archive-thread">
      <header>
        <button className="link-btn archive-back" onClick={onBack}>← Sohbetler</button>
        <b>{titleOf(conv)}</b>
        <small className="muted">{conv.members.map((m) => m.fullName).join(', ')}</small>
        <label className="check"><input type="checkbox" checked={onlyDeleted} onChange={(e) => setOnlyDeleted(e.target.checked)} /> Yalnızca silinen/düzenlenen</label>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="archive-msgs">
        {more && <button className="btn ghost sm" onClick={() => void load(msgs![msgs!.length - 1].id)}>Daha eski mesajlar</button>}
        {msgs && shown.length === 0 && <p className="empty">Gösterilecek mesaj yok.</p>}
        {shown.map((m) => (
          <article key={m.id} className={'archive-msg' + (m.deletedAt ? ' deleted' : '')}>
            <div className="archive-msg-head">
              <b>{m.sender.fullName}</b>
              <small className="muted">{fmtDate(m.createdAt)} {formatTime(m.createdAt)}</small>
              {m.editedAt && <span className="tag"><History size={11} /> düzenlendi</span>}
              {m.deletedAt && <span className="tag danger"><Trash2 size={11} /> {fmtDate(m.deletedAt)} {formatTime(m.deletedAt)} silindi</span>}
              {m.deletedAt && <button className="btn sm" onClick={() => void restore(m)}><RotateCcw size={13} /> Geri getir</button>}
            </div>
            {m.body && <p className="archive-text">{m.body}</p>}
            {m.attachment && <AttachmentView a={m.attachment} />}
            {m.revisions.length > 0 && (
              <details className="archive-revs">
                <summary>Önceki haller ({m.revisions.length})</summary>
                <ol>
                  {m.revisions.map((r) => <li key={r.id}><small className="muted">{fmtDate(r.createdAt)} {formatTime(r.createdAt)} öncesi:</small> {r.body}</li>)}
                </ol>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
