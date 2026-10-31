// Faz 3: masraf ve iş akışı tipleri
import type { UserRef } from './types';

export type ExpenseStatus = 'draft' | 'submitted' | 'manager_approved' | 'accounting_approved' | 'rejected' | 'paid';

export interface ExpenseCategory { id: number; name: string; isActive: boolean; sortOrder: number }
export interface FileRef { id: number; fileName: string; mime: string; size: number }

export interface Expense {
  id: number;
  userId: number;
  categoryId: number;
  amount: number;
  currency: string;
  amountTry: number;
  expenseDate: string;
  description: string;
  status: ExpenseStatus;
  processInstanceId: number | null;
  submittedAt: string | null;
  createdAt: string;
  user: UserRef;
  category: { id: number; name: string };
  _count: { receipts: number };
}

export interface ExpenseApproval {
  id: number;
  step: 'auto' | 'manager' | 'accounting' | 'payment';
  decision: 'approved' | 'rejected' | 'paid';
  comment: string | null;
  at: string;
  approver: UserRef | null;
}

export interface ExpenseDetail extends Expense {
  receipts: FileRef[];
  approvals: ExpenseApproval[];
  openTasks: { id: number; name: string; dueAt: string | null; candidateRole: string | null; candidateLabel?: string | null; assignee: UserRef | null }[];
  canEdit: boolean;
}

export interface ExpenseSettingsData { autoApproveLimit: number; approvalReminderHours: number; aiCategorySuggest: boolean; aiAvailable: boolean }
export interface CategorySuggestion { enabled: boolean; categoryId?: number | null; categoryName?: string | null; confidence?: number }

export interface ProcessTaskItem {
  id: number;
  name: string;
  elementId: string;
  status: 'open' | 'completed' | 'cancelled';
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  candidateRole: string | null;
  candidateLabel?: string | null;
  assignee: UserRef | null;
  completedBy: UserRef | null;
  formData: { decision?: string; comment?: string } | null;
  decisions: string[];
  overdue: boolean;
  instance: {
    id: number; businessKey: string | null; entityType: string | null; entityId: string | null; startedAt: string;
    startedBy: UserRef | null; definition: { name: string; key: string };
  };
}

export interface ProcessDefinition {
  id: number; key: string; name: string; version: number; status: 'draft' | 'active' | 'archived';
  createdAt: string; updatedAt: string; createdBy: UserRef | null; _count: { instances: number }; bpmnXml?: string;
}

export interface ProcessMeta { handlers: { name: string; label: string; argsHint: string }[]; roles: string[]; departments: string[] }

export interface ProcessInstanceItem {
  id: number; businessKey: string | null; entityType: string | null; entityId: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled'; startedAt: string; endedAt: string | null; error: string | null;
  definition: { id: number; key: string; name: string; version: number };
  startedBy: UserRef | null;
  tasks: { id: number; name: string; assignee: UserRef | null; candidateRole: string | null }[];
}

export interface ProcessInstanceDetail extends Omit<ProcessInstanceItem, 'tasks' | 'definition'> {
  definition: { id: number; key: string; name: string; version: number; bpmnXml: string };
  variables: Record<string, unknown>;
  tasks: (Omit<ProcessTaskItem, 'instance' | 'decisions' | 'overdue'>)[];
  events: { id: number; elementId: string | null; type: string; at: string; payload: Record<string, unknown> | null }[];
  highlight: { completed: string[]; active: string[]; failed: string | null };
}

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: 'Taslak',
  submitted: 'Yönetici onayında',
  manager_approved: 'Muhasebe onayında',
  accounting_approved: 'Ödeme bekliyor',
  rejected: 'Reddedildi',
  paid: 'Ödendi',
};
export const STEP_LABEL: Record<string, string> = { auto: 'Otomatik onay', manager: 'Yönetici', accounting: 'Muhasebe', payment: 'Ödeme' };
export const DECISION_LABEL: Record<string, string> = { approved: 'Onayla', rejected: 'Reddet', paid: 'Ödendi olarak işaretle' };
export const DECISION_DONE: Record<string, string> = { approved: 'Onaylandı', rejected: 'Reddedildi', paid: 'Ödendi' };
export const DEF_STATUS_LABEL: Record<string, string> = { draft: 'Taslak', active: 'Etkin', archived: 'Arşiv' };
export const INSTANCE_STATUS_LABEL: Record<string, string> = { running: 'Sürüyor', completed: 'Tamamlandı', failed: 'Hata', cancelled: 'İptal' };

export const money = (n: number, currency = 'TRY') => {
  try { return n.toLocaleString('tr-TR', { style: 'currency', currency }); } catch { return `${n.toFixed(2)} ${currency}`; }
};
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
