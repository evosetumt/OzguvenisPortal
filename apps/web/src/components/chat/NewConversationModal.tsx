import { useState, type FormEvent } from 'react';
import { Avatar } from '../Avatar';
import { Users, User } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import type { Conversation } from '../../lib/types-chat';
import { Modal } from '../Modal';
import { UserPicker } from './UserPicker';

export function NewConversationModal({ onClose, onCreated }: { onClose(): void; onCreated(c: Conversation): void }) {
  const { me } = useAuth();
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const others = (users ?? []).filter((u) => u.id !== me!.id);
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const run = async (fn: () => Promise<Conversation>) => {
    setBusy(true);
    setError('');
    try { onCreated(await fn()); } catch (e) { setError(e instanceof Error ? e.message : 'Oluşturulamadı'); } finally { setBusy(false); }
  };

  const startDirect = (userId: number) => run(() => api<Conversation>('/chat/direct', json('POST', { userId })));
  const createGroup = (e: FormEvent) => {
    e.preventDefault();
    if (!selected.size) { setError('En az bir kişi seçin'); return; }
    void run(() => api<Conversation>('/chat/groups', json('POST', { title, memberIds: [...selected] })));
  };

  const filtered = others.filter((u) => u.fullName.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')));

  return (
    <Modal title="Yeni sohbet" onClose={onClose}>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}><User size={14} /> Birebir</button>
        <button className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}><Users size={14} /> Grup</button>
      </div>
      {mode === 'direct' ? (
        <div className="form">
          <input placeholder="Kişi ara…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <ul className="rows people">
            {filtered.map((u) => (
              <li key={u.id}>
                <button className="person" disabled={busy} onClick={() => startDirect(u.id)}>
                  <Avatar id={u.id} name={u.fullName} size="sm" />{u.fullName}
                </button>
              </li>
            ))}
            {users && filtered.length === 0 && <p className="empty">Kişi bulunamadı.</p>}
          </ul>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <form className="form" onSubmit={createGroup}>
          <label>Grup adı<input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="field">Üyeler ({selected.size})<UserPicker users={others} selected={selected} onToggle={toggle} /></div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
            <button className="btn primary" disabled={busy}>Oluştur</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
