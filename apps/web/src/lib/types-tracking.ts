import type { UserRef } from './types';
import type { UploadedFile } from './files';

export type TrackCategory = 'insurance' | 'vehicle_inspection' | 'vehicle_maintenance' | 'commitment' | 'contract' | 'rent' | 'other';
export type TrackStatus = 'active' | 'renewed' | 'cancelled' | 'expired';
export type RenewalPeriod = 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'biennial';

export interface TrackedItem {
  id: number;
  category: TrackCategory;
  title: string;
  counterparty: string | null;
  vehicleId: number | null;
  startDate: string | null;
  endDate: string;
  amount: string | null; // Decimal JSON'da metin olarak gelir
  currency: string;
  renewalPeriod: RenewalPeriod | null;
  ownerId: number;
  status: TrackStatus;
  reminderDays: string;
  notifyUserIds: string | null;
  notes: string | null;
  owner: UserRef;
  vehicle: { id: number; plate: string; brandModel?: string | null } | null;
  daysLeft: number;
  fileCount?: number;
}

export interface TrackedItemDetail extends TrackedItem {
  files: UploadedFile[];
  notifyUsers: UserRef[];
  reminders: { id: number; daysBefore: number; forEndDate: string; sentAt: string }[];
  canEdit: boolean;
}

export interface TrackingSummary { active: number; in30: number; in7: number; expired: number }

export interface VehicleServiceRec {
  id: number;
  type: string;
  date: string;
  km: number | null;
  cost: string | null;
  nextDueDate: string | null;
  nextDueKm: number | null;
  notes: string | null;
}

export interface Vehicle {
  id: number;
  plate: string;
  brandModel: string | null;
  year: number | null;
  km: number | null;
  notes: string | null;
  assignedUserId: number | null;
  assignedUser: UserRef | null;
  lastService: VehicleServiceRec | null;
  nextDue: { itemId: number; category: TrackCategory; endDate: string; daysLeft: number } | null;
  itemCount: number;
}

export interface VehicleDetail extends Omit<Vehicle, 'lastService' | 'nextDue' | 'itemCount'> {
  services: VehicleServiceRec[];
  items: { id: number; category: TrackCategory; title: string; endDate: string; status: TrackStatus; daysLeft: number }[];
  canEdit: boolean;
}

export const CATEGORY_LABEL: Record<TrackCategory, string> = {
  insurance: 'Kasko / Sigorta',
  vehicle_inspection: 'Araç muayene / vize',
  vehicle_maintenance: 'Araç bakım',
  commitment: 'Taahhütname',
  contract: 'Sözleşme',
  rent: 'Kira',
  other: 'Diğer',
};

export const STATUS_LABEL: Record<TrackStatus, string> = { active: 'Aktif', renewed: 'Yenilendi', cancelled: 'İptal', expired: 'Süresi doldu' };

export const PERIOD_LABEL: Record<RenewalPeriod, string> = {
  none: 'Yok', monthly: 'Aylık', quarterly: '3 aylık', semiannual: '6 aylık', yearly: 'Yıllık', biennial: '2 yıllık',
};

// ---------- WhatsApp ----------

export interface WaStatus {
  configured: boolean;
  phoneNumberIdSet: boolean;
  accessTokenSet: boolean;
  appSecretSet: boolean;
  verifyTokenSet: boolean;
  wabaIdSet: boolean;
  apiVersion: string;
  /** Bildirim olayı → onaylı şablon (sunucudaki katalog + ayarlar). */
  eventTemplates: { event: string; label: string; name: string; language: string }[];
}

export interface WaTemplate { name: string; language: string; params: number; description?: string }

export type WaMsgStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export const WA_STATUS_LABEL: Record<WaMsgStatus, string> = {
  queued: 'Kuyrukta', sent: 'Gönderildi', delivered: 'İletildi', read: 'Okundu', failed: 'Başarısız', received: 'Gelen',
};
