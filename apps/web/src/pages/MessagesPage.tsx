import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCirclePlus, Paperclip, Plus, Search, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { timeAgo } from '../lib/format';
import { useReconnect, useSocketEvent } from '../lib/realtime';
import { conversationTitle, type ChatMessage, type Conversation } from '../lib/types-chat';
import { MessageThread } from '../components/chat/MessageThread';
import { NewConversationModal } from '../components/chat/NewConversationModal';
import { GroupInfoModal } from '../components/chat/GroupInfoModal';
import { lastSeenLabel, onlineFirst, useOnlineIds } from '../lib/online';
import { sortedPeople, usePeople, type Person } from '../lib/people';
import { ChatAvatar, PersonAvatar, directPeer, usePresence } from '../components/chat/ChatAvatar';
import '../styles/chat.css';

/** Durum etiketi yalnız bağlıyken: seçtiği durumun adı ve rengi (bağlı değilken noktasız avatar yeterli, isme yer kalsın). */
function PresenceTag({ userId }: { userId: number }) {
  const { state, dot, label, cls } = usePresence(userId);
  if (!dot) return null;
  return <i className={'conv-status ' + cls} title={lastSeenLabel(state)}>{label}</i>;
}

/** Henüz birebir sohbeti olmayan kişi: dokununca sohbet doğrudan başlar. */
function PersonRow({ person, onStart }: { person: Person; onStart(id: number): void }) {
  const { state, dot } = usePresence(person.id);
  return (
    <li>
      <button className="conv person" onClick={() => onStart(person.id)} title={`${person.fullName} ile sohbet başlat`}>
        <PersonAvatar id={person.id} name={person.fullName} src={person.avatarUrl} size="lg" />
        <span className="conv-body">
          <span className="conv-top"><b>{person.fullName}</b><PresenceTag userId={person.id} /></span>
          <span className="conv-bottom"><small>{dot ? (person.title || 'Mesaj göndermek için dokun') : (lastSeenLabel(state) || person.title || 'Sohbet başlat')}</small></span>
        </span>
        <span className="person-go"><MessageCirclePlus size={18} /></span>
      </button>
    </li>
  );
}

/** Son mesaj önizlemesi: dosya / arama simgeli, kendi mesajında "Siz:". */
function Preview({ m, meId }: { m: ChatMessage | null; meId: number }) {
  if (!m) return <small className="conv-preview muted">Henüz mesaj yok, ilk mesajı yaz</small>;
  if (m.deletedAt) return <small className="conv-preview muted"><i>Mesaj silindi</i></small>;
  return (
    <small className="conv-preview">
      {m.senderId === meId && <span className="conv-me">Siz:</span>}
      {m.attachment && !m.body ? <><Paperclip size={13} /> {m.attachment.fileName}</> : m.body}
    </small>
  );
}

export function MessagesPage() {
  const { me } = useAuth();
  const meId = me!.id;
  const [params, setParams] = useSearchParams();
  const activeId = Number(params.get('c')) || null;
  const { data: convs, setData: setConvs, error, reload } = useApi<Conversation[]>('/chat/conversations');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<false | 'direct' | 'group'>(false);
  const [info, setInfo] = useState(false);
  const [directError, setDirectError] = useState('');

  const select = (id: number | null) => setParams(id ? { c: String(id) } : {});
  const upsert = (c: Conversation) => setConvs((xs) => [c, ...(xs ?? []).filter((x) => x.id !== c.id)]);

  // Ekip / profil ekranından "Mesaj gönder": ?to=<kişi> birebir sohbeti açar (yoksa oluşturur)
  const toId = Number(params.get('to')) || null;
  useEffect(() => {
    if (!toId || toId === meId) return;
    setDirectError('');
    api<Conversation>('/chat/direct', json('POST', { userId: toId }))
      .then((c) => { upsert(c); setParams({ c: String(c.id) }, { replace: true }); })
      .catch((e) => {
        // Sessizce yutulursa "Mesaj gönder" hiçbir şey yapmamış gibi görünür (pasif kullanıcı, yetki, ağ hatası).
        setDirectError(e instanceof Error ? e.message : 'Sohbet açılamadı');
        setParams({}, { replace: true });
      });
  }, [toId]); // eslint-disable-line react-hooks/exhaustive-deps

  useReconnect(() => void reload());
  useSocketEvent<ChatMessage>('message:new', (m) => {
    // Fonksiyonel güncelleme: art arda gelen iki mesajda ilki kaybolmasın.
    if (!convs?.some((x) => x.id === m.conversationId)) { void reload(); return; } // yeni eklendiğimiz bir sohbet
    setConvs((xs) => {
      const c = xs?.find((x) => x.id === m.conversationId);
      if (!xs || !c) return xs;
      const unread = m.senderId !== meId && m.conversationId !== activeId ? c.unread + 1 : c.unread;
      return [{ ...c, lastMessage: m, lastMessageAt: m.createdAt, unread }, ...xs.filter((x) => x.id !== c.id)];
    });
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

  // Birebir sohbeti olmayan kişiler (çevrimiçi olanlar üstte); arama kutusu bunları da süzer.
  const people = usePeople();
  const withChat = new Set((convs ?? []).map((c) => directPeer(c, meId)?.id).filter((id): id is number => !!id));
  const others = sortedPeople(people).filter((p) => p.id !== meId && !withChat.has(p.id) && (!q.trim() || norm(p.fullName).includes(norm(q.trim()))));
  const onlineIds = useOnlineIds(others.map((p) => p.id));
  const contacts = onlineFirst(others, onlineIds);
  // ?to= mevcut akışı kullanır: birebir sohbeti açar (yoksa oluşturur) ve seçer.
  const startWith = (userId: number) => setParams({ to: String(userId) });
  const totalUnread = (convs ?? []).reduce((n, c) => n + c.unread, 0);

  return (
    <div className={'chat' + (active ? ' has-active' : '')}>
      <section className="glass chat-list">
        <header className="chat-list-head">
          <h2>Mesajlar{totalUnread > 0 && <span className="chat-unread-pill">{totalUnread}</span>}</h2>
          <button className="icon-btn" title="Yeni grup" onClick={() => setCreating('group')}><Users size={18} /></button>
          <button className="icon-btn" title="Yeni sohbet" onClick={() => setCreating('direct')}><Plus size={18} /></button>
        </header>
        <label className="chat-search"><Search size={14} /><input placeholder="Sohbet ara…" aria-label="Sohbet ara" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        {directError && <p className="error" role="alert">{directError}</p>}
        {convs && convs.length === 0 && <p className="empty">Henüz sohbet yok. <button className="link-btn" onClick={() => setCreating('direct')}>Yeni sohbet başlatın</button> veya <button className="link-btn" onClick={() => setCreating('group')}>grup kurun</button></p>}
        <ul className="conv-list">
          {list.length > 0 && contacts.length > 0 && <li className="conv-section" aria-hidden="true">Sohbetler</li>}
          {list.map((c) => {
            const peer = directPeer(c, meId);
            return (
              <li key={c.id}>
                <button className={'conv' + (c.id === activeId ? ' active' : '') + (c.unread ? ' unread' : '') + (c.type === 'group' ? ' is-group' : '')} onClick={() => select(c.id)}>
                  <ChatAvatar conversation={c} meId={meId} size="lg" />
                  <span className="conv-body">
                    <span className="conv-top">
                      <b>{conversationTitle(c, meId)}</b>
                      {peer ? <PresenceTag userId={peer.id} /> : <i className="conv-status">{c.members.length} üye</i>}
                      {c.lastMessageAt && <small className="conv-time">{timeAgo(c.lastMessageAt)}</small>}
                    </span>
                    <span className="conv-bottom"><Preview m={c.lastMessage} meId={meId} />{c.unread > 0 && <span className="conv-badge">{c.unread > 99 ? '99+' : c.unread}</span>}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {contacts.length > 0 && (
            <>
              <li className="conv-section" aria-hidden="true">Kişiler · {onlineIds.size} çevrimiçi</li>
              {contacts.map((p) => <PersonRow key={p.id} person={p} onStart={startWith} />)}
            </>
          )}
        </ul>
      </section>

      {active ? (
        <MessageThread key={active.id} conversation={active} meId={meId} onBack={() => select(null)} onInfo={() => setInfo(true)} />
      ) : (
        <section className="glass chat-thread chat-empty">
          <p className="empty">{activeId && convs ? 'Sohbet bulunamadı.' : 'Bir sohbet seçin veya yeni sohbet başlatın.'}</p>
        </section>
      )}

      {creating && <NewConversationModal initialMode={creating} onClose={() => setCreating(false)} onCreated={(c) => { upsert(c); setCreating(false); select(c.id); }} />}
      {info && active && (
        <GroupInfoModal conversation={active} onClose={() => setInfo(false)}
          onChanged={(c) => setConvs((xs) => xs && xs.map((x) => (x.id === c.id ? { ...x, ...c } : x)))}
          onLeft={() => { setInfo(false); select(null); void reload(); }} />
      )}
    </div>
  );
}
