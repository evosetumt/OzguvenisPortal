export interface FeedUser { id: number; fullName: string; avatarUrl: string | null }

export interface FeedFile { id: number; fileName: string; mime: string; size: number }

export interface FeedComment { id: number; body: string; createdAt: string; user: FeedUser }

export interface FeedActivity { id: number; title: string; done: boolean; assignee: string | null; dueDate: string | null }

export type FeedKind = 'post' | 'social' | 'task_created' | 'task_completed' | 'order_created' | 'order_status' | 'quote_created' | 'shipment';

export interface FeedItem {
  id: number;
  kind: FeedKind;
  body: string;
  createdAt: string;
  author: FeedUser | null;
  owner: FeedUser | null;
  customerCode: string | null;
  customerName: string | null;
  relatedLabel: string | null;
  /** İlgili kaydın portal adresi (sunucu üretir). */
  link: string | null;
  likeCount: number;
  likedByMe: boolean;
  likers: string[];
  comments: FeedComment[];
  activities: FeedActivity[];
  /** Paylaşımdaki fotoğraf ve dosyalar */
  files?: FeedFile[];
  canDelete: boolean;
}

export interface FeedPage { scope: 'own' | 'department' | 'all'; hasMore: boolean; items: FeedItem[] }
