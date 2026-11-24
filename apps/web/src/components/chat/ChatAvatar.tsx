import { Users } from 'lucide-react';
import { Avatar } from '../Avatar';
import { presenceDot, useOnline } from '../../lib/online';
import { PRESENCE, usePeople } from '../../lib/people';
import { conversationTitle, type Conversation } from '../../lib/types-chat';

type Size = '' | 'sm' | 'lg';

export const directPeer = (c: Conversation, meId: number) => (c.type === 'direct' ? c.members.find((m) => m.id !== meId) : undefined);

/**
 * Kişinin bağlantı durumu + seçtiği durum: bağlıysa nokta seçtiği renkte (Çevrimiçi yeşil, Odakta mor,
 * Toplantıda turuncu, Uzakta gri) ve etiket o durumun adı; bağlı değilse nokta yok, etiket "çevrimdışı".
 */
export function usePresence(userId: number | undefined) {
  const state = useOnline(userId);
  const people = usePeople();
  const dot = presenceDot(state, userId ? people.get(userId)?.presence : undefined);
  const info = dot ? PRESENCE[dot] : undefined;
  return { state, dot, label: dot ? (info?.label ?? 'Çevrimiçi') : 'çevrimdışı', cls: info?.cls ?? 'off' };
}

/** Kişi avatarı (fotoğraf) + durum noktası. */
export function PersonAvatar({ id, name, src, size = '' }: { id: number; name: string; src?: string | null; size?: Size }) {
  const { dot } = usePresence(id);
  return <Avatar id={id} name={name} src={src} size={size} presence={dot ?? false} />;
}

/** Sohbet avatarı: birebir sohbette karşı tarafın fotoğrafı ve durum noktası, grupta renkli grup simgesi. */
export function ChatAvatar({ conversation, meId, size = '' }: { conversation: Conversation; meId: number; size?: Size }) {
  const peer = directPeer(conversation, meId);
  if (peer) return <PersonAvatar id={peer.id} name={peer.fullName} size={size} />;
  return (
    <span className={'chat-group-av ' + size} aria-hidden="true" title={conversationTitle(conversation, meId)}>
      <Users size={size === 'sm' ? 15 : 20} />
      <b>{conversation.members.length}</b>
    </span>
  );
}
