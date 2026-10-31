import { apiUrl } from '../lib/api';
import { initials } from '../lib/format';
import { PRESENCE, usePeople } from '../lib/people';

/**
 * Kişi simgesi: profil fotoğrafı varsa görsel, yoksa baş harfler. id verilirse fotoğraf ve durum rehberden bulunur.
 * size: '' (36px) | 'sm' | 'xs' | 'lg' | 'xl'
 */
export function Avatar({ id, name, src, size = '', presence, className = '', title }: {
  id?: number | null; name: string; src?: string | null; size?: '' | 'sm' | 'xs' | 'lg' | 'xl';
  presence?: boolean | string; className?: string; title?: string;
}) {
  const people = usePeople();
  const p = id ? people.get(id) : undefined;
  const photo = src ?? p?.avatarUrl ?? null;
  const state = typeof presence === 'string' ? presence : presence ? p?.presence : undefined;
  const cls = `avatar ${size} ${photo ? 'has-photo' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  return (
    <span className={cls} title={title}>
      {photo ? <img src={apiUrl(photo)} alt="" loading="lazy" draggable={false} /> : initials(name)}
      {state && <i className={'av-presence ' + (PRESENCE[state]?.cls ?? 'off')} aria-label={PRESENCE[state]?.label} />}
    </span>
  );
}
