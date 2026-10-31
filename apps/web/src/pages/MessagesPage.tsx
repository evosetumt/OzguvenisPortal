import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { initials, timeAgo } from '../lib/format';
import { useReconnect, useSocketEvent } from '../lib/realtime';
import { conversationTitle, type ChatMessage, type Conversation } from '../lib/types-chat';
import { MessageThread } from '../components/chat/MessageThread';
import { NewConversationModal } from '../components/chat/NewConversationModal';
import { GroupInfoModal } from '../components/chat/GroupInfoModal';
import '../styles/chat.css';

const preview = (m: ChatMessage | null, meId: number) => {
  if (!m) return 'Henüz mesaj yok';
  if (m.deletedAt) return 'Mesaj silindi';
  const text = m.body || (m.attachment ? '📎 ' + m.attachment.fileName : '');
  return (m.senderId === meId ? 'Siz: ' : '') + text;
};

export function MessagesPage() {
  const { me } = useAuth();
  const meId = me!.id;
  const [params, setParams] = useSearchParams();
  const activeId = Number(params.get('c')) || null;
  const { data: convs, setData: setConvs, error, reload } = useApi<Conversation[]>('/chat/conversations');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [info, setInfo] = useState(false);

  const select = (id: number | null) => setParams(id ? { c: String(id) } : {});
  const upsert = (c: Conversation) => setConvs((xs) => [c, ...(xs ?? []).filter((x) => x.id !== c.id)]);

  // Ekip / profil ekranından "Mesaj gönder": ?to=<kişi> birebir sohbeti açar (yoksa oluşturur)
  const toId = Number(params.get('to')) || null;
  useEffect(() => {
    if (!toId || toId === meId) return;
    api<Conversation>('/chat/direct', json('POST', { userId: toId }))
      .then((c) => { upsert(c); setParams({ c: String(c.id) }, { replace: true }); })
      .catch(() => setParams({}, { replace: true }));
  }, [toId]); // eslint-disable-line react-hooks/exhaustive-deps

  useReconnect(() => void reload());
  useSocketEvent<ChatMessage>('message:new', (m) => {
    const list = convs ?? [];
    const c = list.find((x) => x.id === m.conversationId);
    if (!c) { void reload(); return; } // yeni eklendiğimiz bir sohbet
    const unread = m.senderId !== meId && m.conversationId !== activeId ? c.unread + 1 : c.unread;
    setConvs([{ ...c, lastMessage: m, lastMessageAt: m.createdAt, unread }, ...list.filter((x) => x.id !== c.id)]);
  });
  useSocketEvent<ChatMessage>('message:updated', (m) => {
    setConvs((xs) => xs && xs.map((c) => (c.lastMessage?.id === m.id ? { ...c, lastMessage: m } : c)));
  });
  useSocketEvent<{ conversationId: number; userId: number; messageId: number }>('read', (r) => {
    setConvs((xs) => xs && xs.map((c) => (c.id !== r.conversationId ? c : {
      ...c,
      unread: r.userId === meId ? 0 : c.unread,
      members: c.members.map((m) => (m.id === r.userId ? { ...m, lastReadMessageId: r.messageId } : m)),
    })));
  });
  useSocketEvent<{ conversationId: number; removedUserId?: number }>('conversation:updated', (e) => {
    if (e.removedUserId === meId && e.conversationId === activeId) select(null);
    void reload();
  });

  const active = convs?.find((c) => c.id === activeId) ?? null;
  const norm = (s: string) => s.toLocaleLowerCase('tr-TR');
  const list = (convs ?? []).filter((c) => !q.trim() || norm(conversationTitle(c, meId)).includes(norm(q.trim())));

  return (
    <div className={'chat' + (active ? ' has-active' : '')}>
      <section className="glass chat-list">
        <header className="chat-list-head">
          <h2>Mesajlar</h2>
          <button className="icon-btn" title="Yeni sohbet" onClick={() => setCreating(true)}><Plus size={18} /></button>
        </header>
        <label className="chat-search"><Search size={14} /><input placeholder="Sohbet ara…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        {convs && convs.length === 0 && <p className="empty">Henüz sohbet yok. <button className="link-btn" onClick={() => setCreating(true)}>Yeni sohbet başlatın</button></p>}
        <ul className="conv-list">
          {list.map((c) => (
            <li key={c.id}>
              <button className={'conv' + (c.id === activeId ? ' active' : '') + (c.unread ? ' unread' : '')} onClick={() => select(c.id)}>
                <span className="avatar">{c.type === 'group' ? '#' : initials(conversationTitle(c, meId))}</span>
                <span className="conv-body">
                  <span className="conv-top"><b>{conversationTitle(c, meId)}</b>{c.lastMessageAt && <small>{timeAgo(c.lastMessageAt)}</small>}</span>
                  <span className="conv-bottom"><small>{preview(c.lastMessage, meId)}</small>{c.unread > 0 && <span className="nav-count">{c.unread}</span>}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {active ? (
        <MessageThread key={active.id} conversation={active} meId={meId} onBack={() => select(null)} onInfo={() => setInfo(true)} />
      ) : (
        <section className="glass chat-thread chat-empty">
          <p className="empty">{activeId && convs ? 'Sohbet bulunamadı.' : 'Bir sohbet seçin veya yeni sohbet başlatın.'}</p>
        </section>
      )}

      {creating && <NewConversationModal onClose={() => setCreating(false)} onCreated={(c) => { upsert(c); setCreating(false); select(c.id); }} />}
      {info && active && (
        <GroupInfoModal conversation={active} onClose={() => setInfo(false)}
          onChanged={(c) => setConvs((xs) => xs && xs.map((x) => (x.id === c.id ? { ...x, ...c } : x)))}
          onLeft={() => { setInfo(false); select(null); void reload(); }} />
      )}
    </div>
  );
}
