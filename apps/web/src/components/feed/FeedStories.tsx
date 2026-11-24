import { Users } from 'lucide-react';
import { Avatar } from '../Avatar';
import { useOnline } from '../../lib/online';
import type { Person } from '../../lib/people';

type Props = {
  people: Person[];
  /** Seçili kişinin id'si; boş dize "Herkes" */
  value: string;
  onChange(userId: string): void;
};

/**
 * Hikâye şeridi: ekip yatay kayan yuvarlaklar halinde; çevrimiçi olanın halkası renkli.
 * Dokununca akış o kişinin kartlarına süzülür (yeniden dokununca herkes).
 */
export function FeedStories({ people, value, onChange }: Props) {
  return (
    <nav className="fd-stories" aria-label="Kişiye göre süz">
      <button type="button" className={'fd-story all' + (value === '' ? ' on' : '')} onClick={() => onChange('')} aria-pressed={value === ''}>
        <span className="fd-story__ring"><span className="fd-story__all"><Users size={22} /></span></span>
        <span className="fd-story__name">Herkes</span>
      </button>
      {people.map((p) => (
        <Story key={p.id} person={p} selected={value === String(p.id)} onPick={() => onChange(value === String(p.id) ? '' : String(p.id))} />
      ))}
    </nav>
  );
}

function Story({ person, selected, onPick }: { person: Person; selected: boolean; onPick(): void }) {
  const online = useOnline(person.id)?.online ?? false;
  const first = person.fullName.split(' ')[0];
  return (
    <button type="button" className={'fd-story' + (online ? ' online' : '') + (selected ? ' on' : '')} onClick={onPick}
      aria-pressed={selected} title={person.fullName + (online ? ' · çevrimiçi' : '')}>
      <span className="fd-story__ring"><Avatar id={person.id} name={person.fullName} src={person.avatarUrl} size="lg" /></span>
      <span className="fd-story__name">{first}</span>
    </button>
  );
}
