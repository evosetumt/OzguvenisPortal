import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, FileText, Info, Paperclip, Pencil, Phone, Send, Trash2, Video, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { formatTime, initials } from '../../lib/format';
import { fileUrl, formatSize, openFile, uploadFile, type UploadedFile } from '../../lib/files';
import { emitTyping, useReconnect, useSocketEvent } from '../../lib/realtime';
import { conversationTitle, type ChatAttachment, type ChatMessage, type Conversation } from '../../lib/types-chat';
import { useCalls } from '../../lib/calls';
import type { CallKind } from '../../lib/types-call';

const PAGE = 40;

export function MessageThread({ conversation: c, meId, onBack, onInfo }: {
  conversation: Conversation; meId: number; onBack(): void; onInfo(): void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); // eskiden yeniye
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState<Record<number, number>>({}); // userId -> zaman
  const box = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null); // eski mesaj yüklenince kaydırma konumunu korumak için
  const stickBottom = useRef(true);

  const markRead = useCallback((messageId?: number) => {
    if (document.visibilityState !== 'visible') return;
    void api(`/chat/conversations/${c.id}/read`, json('POST', messageId ? { messageId } : {})).catch(() => undefined);
  }, [c.id]);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<ChatMessage[]>(`/chat/conversations/${c.id}/messages?take=${PAGE}`);
      setMessages(rows.reverse());
      setHasMore(rows.length === PAGE);
      stickBottom.current = true;
      setError('');
      markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mesajlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [c.id, markRead]);

  useEffect(() => { setMessages([]); void loadLatest(); }, [loadLatest]);
  useReconnect(() => void loadLatest());

  const loadOlder = async () => {
    if (!hasMore || loading || !messages.length) return;
    setLoading(true);
    try {
      const rows = await api<ChatMessage[]>(`/chat/conversations/${c.id}/messages?take=${PAGE}&before=${messages[0].id}`);
      const el = box.current;
      if (el) keepFromBottom.current = el.scrollHeight - el.scrollTop;
      setMessages((xs) => [...rows.reverse(), ...xs]);
      setHasMore(rows.length === PAGE);
    } finally {
      setLoading(false);
    }
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (keepFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    } else if (stickBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Klavye açılınca/kapanınca mesaj alanı küçülür-büyür: en alttaysa en altta kalsın (son mesajlar klavyenin arkasında kalmasın).
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (stickBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = box.current!;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60) void loadOlder();
  };

  useSocketEvent<ChatMessage>('message:new', (m) => {
    if (m.conversationId !== c.id) return;
    setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    setTyping((t) => { const n = { ...t }; delete n[m.senderId]; return n; });
    if (m.senderId !== meId) markRead(m.id);
  });
  useSocketEvent<ChatMessage>('message:updated', (m) => {
    if (m.conversationId === c.id) setMessages((xs) => xs.map((x) => (x.id === m.id ? m : x)));
  });
  useSocketEvent<{ conversationId: number; userId: number }>('typing', (t) => {
    if (t.conversationId === c.id) setTyping((s) => ({ ...s, [t.userId]: Date.now() }));
  });
  useEffect(() => {
    const t = setInterval(() => setTyping((s) => {
      const now = Date.now();
      const n = Object.fromEntries(Object.entries(s).filter(([, at]) => now - at < 4000));
      return Object.keys(n).length === Object.keys(s).length ? s : n;
    }), 1000);
    return () => clearInterval(t);
  }, []);

  const typingNames = Object.keys(typing)
    .map((id) => c.members.find((m) => m.id === Number(id))?.fullName.split(' ')[0])
    .filter(Boolean);

  const calls = useCalls();
  const startCall = (kind: CallKind) => {
    calls.startCall(c.id, kind).catch((e) => setError(e instanceof Error ? e.message : 'Arama başlatılamadı'));
  };

  // Birebir sohbette "okundu" göstergesi: karşı tarafın okundu imleci.
  const other = c.type === 'direct' ? c.members.find((m) => m.id !== meId) : undefined;
  const lastMine = [...messages].reverse().find((m) => m.senderId === meId && !m.deletedAt);

  return (
    <section className="glass chat-thread">
      <header className="chat-head">
        <button className="icon-btn chat-back" title="Geri" onClick={onBack}><ArrowLeft size={18} /></button>
        <div className="avatar">{c.type === 'group' ? '#' : initials(conversationTitle(c, meId))}</div>
        <div className="who">
          <b>{conversationTitle(c, meId)}</b>
          <small>{typingNames.length ? `${typingNames.join(', ')} yazıyor…` : c.type === 'group' ? `${c.members.length} üye` : 'Birebir sohbet'}</small>
        </div>
        <div className="chat-call">
          <button className="btn sm" title="Sesli ara" disabled={!!calls.active} onClick={() => startCall('audio')}><Phone size={16} /><span>Sesli</span></button>
          <button className="btn sm" title="Görüntülü ara" disabled={!!calls.active} onClick={() => startCall('video')}><Video size={16} /><span>Görüntülü</span></button>
        </div>
        {c.type === 'group' && <button className="icon-btn" title="Grup bilgisi" onClick={onInfo}><Info size={18} /></button>}
      </header>

      <div className="chat-messages" ref={box} onScroll={onScroll}>
        {hasMore && messages.length > 0 && <button className="link-btn load-older" onClick={loadOlder} disabled={loading}>Daha eski mesajlar</button>}
        {!loading && messages.length === 0 && !error && <p className="empty center">Henüz mesaj yok. İlk mesajı yazın.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev && prev.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && <div className="day-sep"><span>{new Date(m.createdAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>}
              <Bubble m={m} mine={m.senderId === meId} showName={c.type === 'group' && !grouped && m.senderId !== meId}
                read={!!other && m.id === lastMine?.id && (other.lastReadMessageId ?? 0) >= m.id} />
            </div>
          );
        })}
      </div>
      {error && <p className="error chat-error">{error}</p>}
      <Composer conversationId={c.id} onError={setError} />
    </section>
  );
}

/** Mesaj metnindeki portal toplantı bağlantılarını tıklanabilir yapar. */
function renderBody(body: string): ReactNode[] {
  return body.split(/(\/meetings\?id=\d+)/g).map((part, i) =>
    /^\/meetings\?id=\d+$/.test(part) ? <Link key={i} to={part + '&join=1'}>Toplantıya katıl</Link> : part,
  );
}

/** Telefonda klavye kısayolu ipucu yer kaplamasın (yer tutucu tek satıra sığsın). */
const COMPOSER_HINT = typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches
  ? 'Mesaj yazın…'
  : 'Mesaj yazın… (Enter gönderir, Shift+Enter yeni satır)';

function Bubble({ m, mine, showName, read }: { m: ChatMessage; mine: boolean; showName: boolean; read: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [err, setErr] = useState('');
  // Dokunmatik ekranda düzenle/sil araçları mesaja dokununca açılır (fareyle üzerine gelince zaten görünür).
  const [tools, setTools] = useState(false);
  // Arama özeti ("📞 Sesli arama · 3 dk") sistem kaydıdır: düzenlenmez, silinmez.
  const editable = mine && !m.deletedAt && !m.callId;

  const save = async () => {
    if (!text.trim() || text === m.body) { setEditing(false); return; }
    try { await api(`/chat/messages/${m.id}`, json('PATCH', { body: text })); setEditing(false); } catch (e) { setErr(e instanceof Error ? e.message : 'Kaydedilemedi'); }
  };
  const remove = async () => {
    if (!window.confirm('Mesaj silinsin mi?')) return;
    try { await api(`/chat/messages/${m.id}`, json('DELETE')); } catch (e) { setErr(e instanceof Error ? e.message : 'Silinemedi'); }
  };

  return (
    <div className={'msg' + (mine ? ' mine' : '') + (tools ? ' tools-open' : '') + (m.callId ? ' call' : '')}>
      <div className="bubble" onClick={() => editable && !editing && setTools((v) => !v)}>
        {showName && <b className="msg-name">{m.sender.fullName}</b>}
        {m.deletedAt ? <i className="muted">Bu mesaj silindi</i> : editing ? (
          <div className="msg-edit">
            <textarea value={text} rows={2} maxLength={4000} autoFocus onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); } if (e.key === 'Escape') setEditing(false); }} />
            <div className="actions"><button className="link-btn" onClick={() => setEditing(false)}>Vazgeç</button><button className="link-btn" onClick={save}>Kaydet</button></div>
          </div>
        ) : (
          <>
            {m.attachment && <AttachmentView a={m.attachment} />}
            {m.body && <p>{renderBody(m.body)}</p>}
          </>
        )}
        <small className="msg-meta">
          {formatTime(m.createdAt)}{m.editedAt && !m.deletedAt && ' · düzenlendi'}
          {mine && !m.deletedAt && (read ? <CheckCheck size={13} aria-label="Okundu" /> : <Check size={13} aria-label="Gönderildi" />)}
        </small>
        {err && <small className="danger">{err}</small>}
      </div>
      {editable && !editing && (
        <div className="msg-tools">
          {m.body && <button className="icon-btn sm" title="Düzenle" onClick={() => { setText(m.body); setEditing(true); setTools(false); }}><Pencil size={13} /></button>}
          <button className="icon-btn sm" title="Sil" onClick={remove}><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

export function AttachmentView({ a }: { a: ChatAttachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const isImage = a.mime.startsWith('image/') && a.mime !== 'image/heic';
  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let alive = true;
    fileUrl(a.id).then((u) => { url = u; if (alive) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [a.id, isImage]);

  if (isImage && src) return <button className="msg-image" onClick={() => openFile(a.id)}><img src={src} alt={a.fileName} /></button>;
  return (
    <button className="msg-file" onClick={() => openFile(a.id)}>
      <FileText size={18} /><span>{a.fileName}<small>{formatSize(a.size)}</small></span>
    </button>
  );
}

function Composer({ conversationId, onError }: { conversationId: number; onError(msg: string): void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const lastTyping = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(''); setFile(null); input.current?.focus(); }, [conversationId]);

  const send = async () => {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    try {
      await api(`/chat/conversations/${conversationId}/messages`, json('POST', { body: text.trim() || undefined, attachmentId: file?.id }));
      setText('');
      setFile(null);
      onError('');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); return; }
    if (Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); emitTyping(conversationId); }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { setFile(await uploadFile(f)); onError(''); } catch (e) { onError(e instanceof Error ? e.message : 'Dosya yüklenemedi'); } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="composer">
      {file && (
        <div className="composer-file">
          <Paperclip size={14} /> {file.fileName} <small>{formatSize(file.size)}</small>
          <button className="icon-btn sm" title="Kaldır" onClick={() => { void api(`/attachments/${file.id}`, json('DELETE')).catch(() => undefined); setFile(null); }}><X size={13} /></button>
        </div>
      )}
      <div className="composer-row">
        <button className="icon-btn" title="Dosya ekle" disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip size={18} /></button>
        <input ref={fileInput} type="file" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <textarea ref={input} rows={1} maxLength={4000} placeholder={COMPOSER_HINT}
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <button className="btn primary send" title="Gönder" disabled={busy || (!text.trim() && !file)} onClick={send}><Send size={16} /></button>
      </div>
    </div>
  );
}
