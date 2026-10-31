export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskType = 'general' | 'erp_order' | 'erp_quote';

export interface UserRef { id: number; fullName: string; avatarUrl?: string | null; departmentId?: number | null }
export interface Project { id: number; name: string; color: string; pinned: boolean; ownerId: number | null; openTasks: number }
export interface TaskStatus { id: number; name: string; sortOrder: number; isDone: boolean }

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  projectId: number | null;
  statusId: number;
  assigneeId: number | null;
  createdById: number;
  dueDate: string | null;
  sortOrder: number;
  taskType: TaskType;
  customerRef: string | null;
  erpDocNo: string | null;
  completedAt: string | null;
  project: { id: number; name: string; color: string } | null;
  status: { id: number; name: string; isDone: boolean };
  assignee: UserRef | null;
  subtaskTotal: number;
  subtaskDone: number;
  commentCount: number;
}

export interface Subtask { id: number; title: string; done: boolean }
export interface Comment { id: number; body: string; createdAt: string; user: UserRef }

export interface TaskDetail extends Omit<Task, 'subtaskTotal' | 'subtaskDone' | 'commentCount'> {
  subtasks: Subtask[];
  comments: Comment[];
  watchers: UserRef[];
  createdBy: UserRef;
  canEdit: boolean;
}

export interface TaskSummary { open: number; dueThisWeek: number; overdue: number; completedThisWeek: number }

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CalendarItem {
  key: string;
  kind: string; // event | task | diğer modüller (meeting, tracking, shipment ...)
  id: number;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color?: string;
  done?: boolean;
  visibility?: 'private' | 'department' | 'company';
  location?: string | null;
  description?: string | null;
  owner?: UserRef;
  attendees?: UserRef[];
  canEdit?: boolean;
  link?: string;
}

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', urgent: 'Acil' };
export const TASK_TYPE_LABEL: Record<TaskType, string> = { general: 'Genel', erp_order: 'Sipariş girişi', erp_quote: 'Teklif verme' };
