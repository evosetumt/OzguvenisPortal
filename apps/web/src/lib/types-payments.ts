import type { UserRef } from './types';

export type PaymentType = 'cheque' | 'credit_card' | 'loan' | 'tax' | 'sgk' | 'rent' | 'invoice' | 'other';
export type PaymentStatus = 'planned' | 'awaiting' | 'assigned' | 'paid' | 'cancelled';
export type Recurrence = 'none' | 'monthly' | 'quarterly' | 'yearly';

export const TYPE_LABEL: Record<PaymentType, string> = {
  cheque: 'Çek', credit_card: 'Kredi kartı', loan: 'Kredi taksiti', tax: 'Vergi', sgk: 'SGK', rent: 'Kira', invoice: 'Fatura', other: 'Diğer',
};
export const STATUS_LABEL: Record<PaymentStatus, string> = {
  planned: 'Planlandı', awaiting: 'Görevlendirme bekliyor', assigned: 'Görevlendirildi', paid: 'Ödendi', cancelled: 'İptal',
};
export const RECURRENCE_LABEL: Record<Recurrence, string> = { none: 'Tek sefer', monthly: 'Her ay', quarterly: '3 ayda bir', yearly: 'Her yıl' };

export interface Payment {
  id: number;
  type: PaymentType;
  title: string;
  counterparty: string | null;
  docNo: string | null;
  amount: string;
  currency: string;
  dueDate: string;
  departmentId: number;
  department: { id: number; name: string; managerId: number | null; manager: UserRef | null };
  leadDays: number | null;
  effectiveLeadDays: number;
  taskDate: string;
  recurrence: Recurrence;
  status: PaymentStatus;
  task: { id: number; status: { name: string; isDone: boolean } } | null;
  assignee: UserRef | null;
  taskOpenedAt: string | null;
  paidAt: string | null;
  paidBy: UserRef | null;
  createdBy: UserRef;
  createdAt: string;
  notes: string | null;
  daysLeft: number;
  canAssign: boolean;
  canEdit: boolean;
  canPay: boolean;
}

export interface PaymentSummary { awaiting: number; in7: number; in30: number; overdue: number; totals30: { currency: string; amount: number }[] }
export interface Department { id: number; name: string; manager: UserRef | null }
