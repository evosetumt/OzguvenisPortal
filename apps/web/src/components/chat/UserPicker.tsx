import { useState } from 'react';
import type { UserRef } from '../../lib/types';

/** Rehberden kullanıcı seçimi (arama + çip). `single` ise tıklanan kullanıcı hemen döner. */
export function UserPicker({ users, selected, onToggle, exclude = [] }: {
  users: UserRef[]; selected: Set<number>; onToggle(id: number): void; exclude?: number[];
}) {
  const [q, setQ] = useState('');
  const list = users
    .filter((u) => !exclude.includes(u.id))
    .filter((u) => u.fullName.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')));
  return (
    <div className="user-picker">
      <input placeholder="Kişi ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {list.map((u) => (
          <button type="button" key={u.id} className={'chip' + (selected.has(u.id) ? ' on' : '')} onClick={() => onToggle(u.id)}>{u.fullName}</button>
        ))}
        {list.length === 0 && <p className="empty">Kişi bulunamadı.</p>}
      </div>
    </div>
  );
}
