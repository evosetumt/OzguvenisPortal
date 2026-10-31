import { useState, type FormEvent } from 'react';
import { Avatar } from '../Avatar';
import { LogOut, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import type { Conversation } from '../../lib/types-chat';
import { Modal } from '../Modal';
import { UserPicker } from './UserPicker';

/** Grup bilgisi: ad değiştirme ve üye ekleme/çıkarma (yalnızca oluşturan), gruptan ayrılma (herkes). */
export function GroupInfoModal({ conversation: c, onClose, onChanged, onLeft }: {
  conversation: Conversation; onClose(): void; onChanged(c: Conversation): void; onLeft(): void;
}) {
  const { me } = useAuth();
  const isOwner = c.createdById === me!.id;
  const { data: users } = useApi<UserRef[]>(isOwner ? '/users/directory' : null);
  const [title, setTitle] = useState(c.title ?? '');
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  const wrap = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'İşlem başarısız'); }
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    void wrap(async () => onChanged(await api<Conversation>(`/chat/conversations/${c.id}`, json('PATCH', { title }))));
  };
  const add = () => wrap(async () => {
    onChanged(await api<Conversation>(`/chat/conversations/${c.id}/members`, json('POST', { userIds: [...adding] })));
    setAdding(new Set());
  });
  const remove = (userId: number) => wrap(async () => {
    await api(`/chat/conversations/${c.id}/members/${userId}`, json('DELETE'));
    if (userId === me!.id) onLeft();
    else onChanged({ ...c, members: c.members.filter((m) => m.id !== userId) });
  });
  const toggle = (id: number) => setAdding((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal title="Grup bilgisi" onClose={onClose}>
      <div className="form">
        {isOwner ? (
          <form className="inline-form" onSubmit={rename}>
            <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Grup adı" />
            <button className="btn ghost sm">Kaydet</button>
          </form>
        ) : <h3>{c.title}</h3>}
        <h4>Üyeler ({c.members.length})</h4>
        <ul className="rows people">
          {c.members.map((m) => (
            <li key={m.id} className="person">
              <Avatar id={m.id} name={m.fullName} size="sm" />
              <span>{m.fullName}{m.id === c.createdById && <small> · yönetici</small>}</span>
              {isOwner && m.id !== me!.id && (
                <button className="icon-btn sm push" title="Gruptan çıkar" onClick={() => remove(m.id)}><X size={14} /></button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && users && (
          <>
            <h4>Üye ekle</h4>
            <UserPicker users={users} selected={adding} onToggle={toggle} exclude={c.members.map((m) => m.id)} />
            {adding.size > 0 && <div className="actions"><button className="btn primary sm" onClick={add}>{adding.size} kişiyi ekle</button></div>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn danger sm push-right" onClick={() => remove(me!.id)}><LogOut size={14} /> Gruptan ayrıl</button>
          <button className="btn ghost" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </Modal>
  );
}
