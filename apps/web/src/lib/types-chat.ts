import type { UserRef } from './types';

export interface ChatAttachment { id: number; fileName: string; mime: string; size: number }

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: UserRef;
  attachment: ChatAttachment | null;
  /** Arama özeti mesajıysa aramanın kimliği */
  callId?: number | null;
}

export interface ConversationMember extends UserRef { lastReadMessageId: number | null }

export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  title: string | null;
  createdById: number;
  lastMessageAt: string | null;
  createdAt: string;
  members: ConversationMember[];
  lastMessage: ChatMessage | null;
  unread: number;
}

export interface Meeting {
  id: number;
  title: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  organizerId: number;
  conversationId: number | null;
  organizer: UserRef;
  participants: UserRef[];
  canEdit: boolean;
  canAssignTasks: boolean;
  joinable: boolean;
}

/** Toplantı sırasında açılan görev. */
export interface MeetingTask {
  id: number;
  title: string;
  dueDate: string | null;
  priority: string;
  createdAt: string;
  status: { id: number; name: string; isDone: boolean };
  assignee: UserRef | null;
  createdBy: UserRef;
}

/** Sohbet arşivi (chat.audit): silinenler dahil tüm mesajlar. */
export interface ArchiveConversation {
  id: number;
  type: 'direct' | 'group';
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  members: UserRef[];
  messageCount: number;
  deletedCount: number;
}

export interface ArchiveMessage extends ChatMessage {
  revisions: { id: number; body: string; createdAt: string }[];
}

/** Birebir sohbette karşı tarafın adı, grupta başlık. */
export const conversationTitle = (c: Conversation, meId: number) =>
  c.type === 'group' ? c.title ?? 'Grup' : c.members.find((m) => m.id !== meId)?.fullName ?? 'Sohbet';
