import type { UserRef } from './types';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled';
export type ParticipantState = 'ringing' | 'joined' | 'left' | 'declined' | 'missed';

export interface CallParticipant extends UserRef { state: ParticipantState; joinedAt: string | null; leftAt: string | null }

/** Sunucunun döndürdüğü arama özeti (call:incoming, call:updated, /calls/:id). */
export interface CallView {
  id: number;
  kind: CallKind;
  status: CallStatus;
  conversationId: number | null;
  meetingId: number | null;
  startedById: number;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  conversation: { id: number; type: 'direct' | 'group'; title: string | null } | null;
  meeting: { id: number; title: string } | null;
  startedBy: UserRef;
  participants: CallParticipant[];
}

/** Katılınca dönen: içeridekiler (bunlara teklif gönderilir) ve ICE sunucuları. */
export interface JoinResult { call: CallView; peers: number[]; iceServers: RTCIceServer[] }

/** Toplantı katılım geçmişi. */
export interface AttendanceSession {
  id: number;
  startedAt: string;
  endedAt: string | null;
  status: CallStatus;
  participants: (UserRef & { joinedAt: string | null; leftAt: string | null })[];
}

/** Aramanın başlığı: toplantı adı, grup adı veya birebirde karşı taraf. */
export function callTitle(c: CallView, meId: number) {
  if (c.meeting) return c.meeting.title;
  if (c.conversation?.type === 'group') return c.conversation.title ?? 'Grup araması';
  const other = c.participants.find((p) => p.id !== meId);
  return other?.fullName ?? c.startedBy.fullName;
}
