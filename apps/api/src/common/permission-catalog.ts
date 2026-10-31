/**
 * Modül bazlı yetki kataloğu: Ayarlar → Roller ve yetkiler ekranı bu listeyi gösterir.
 * Her izin bir modüle bağlıdır; kapsam (scope) kaydın kimden olduğunu sınırlar:
 *   own: yalnızca kendi kayıtları / atandıkları · department: departmanı (Netsis'te plasiyer) · all: tümü.
 * Yalnızca 'all' alabilen izinler aç/kapat şeklinde gösterilir (ör. kullanıcı yönetimi).
 * Yeni izin eklenince buraya ve prisma/seed.ts → PERMISSIONS listesine eklenir.
 */
export type Scope = 'own' | 'department' | 'all';

export interface PermissionDef { code: string; label: string; scopes: Scope[] }
export interface ModuleDef { key: string; label: string; financial?: boolean; permissions: PermissionDef[] }

const ALL: Scope[] = ['own', 'department', 'all'];
const ONLY_ALL: Scope[] = ['all'];

export const PERMISSION_CATALOG: ModuleDef[] = [
  {
    key: 'tasks', label: 'Görevler ve takvim', permissions: [
      { code: 'task.read', label: 'Görevleri görüntüle', scopes: ALL },
      { code: 'task.write', label: 'Görev oluştur/düzenle ve başkasına ata', scopes: ALL },
      { code: 'calendar.read', label: 'Takvimi görüntüle', scopes: ALL },
    ],
  },
  {
    key: 'reports', label: 'Analiz ve raporlar', permissions: [
      { code: 'report.read', label: 'Görev analizi ve raporlar', scopes: ALL },
    ],
  },
  {
    key: 'accounts', label: 'Cari hesaplar (Netsis)', financial: true, permissions: [
      { code: 'account.read', label: 'Cari kartlar, bakiyeler, ekstre ve faturalar', scopes: ALL },
    ],
  },
  {
    key: 'sales', label: 'Sipariş, teklif ve sevkiyat (Netsis)', financial: true, permissions: [
      { code: 'order.read', label: 'Siparişler (tutarlar dahil)', scopes: ALL },
      { code: 'quote.read', label: 'Teklifler (tutarlar dahil)', scopes: ALL },
      { code: 'shipment.read', label: 'Sevkiyat ve teslimat', scopes: ALL },
    ],
  },
  {
    key: 'expenses', label: 'Masraflar', financial: true, permissions: [
      { code: 'expense.create', label: 'Masraf gir', scopes: ['own'] },
      { code: 'expense.approve', label: 'Masraf onayla (yönetici)', scopes: ['department', 'all'] },
      { code: 'expense.accounting', label: 'Masraf muhasebe onayı', scopes: ONLY_ALL },
    ],
  },
  {
    key: 'payments', label: 'Ödeme takibi (çek, kredi kartı, vergi/SGK, kira)', financial: true, permissions: [
      { code: 'payment.read', label: 'Ödemeleri görüntüle', scopes: ALL },
      { code: 'payment.manage', label: 'Ödeme kaydı yönet', scopes: ['department', 'all'] },
    ],
  },
  {
    key: 'tracking', label: 'Süre takibi ve araçlar', permissions: [
      { code: 'tracking.read', label: 'Süre takibini görüntüle', scopes: ALL },
      { code: 'tracking.write', label: 'Kayıt ve araç yönet', scopes: ALL },
    ],
  },
  {
    key: 'whatsapp', label: 'WhatsApp', permissions: [
      { code: 'whatsapp.send', label: 'WhatsApp mesajı gönder', scopes: ONLY_ALL },
    ],
  },
  {
    key: 'admin', label: 'Yönetim', permissions: [
      { code: 'user.read', label: 'Kullanıcı listesini görüntüle', scopes: ONLY_ALL },
      { code: 'user.manage', label: 'Kullanıcı, rol ve departman yönet', scopes: ONLY_ALL },
      { code: 'notification.manage', label: 'Bildirim kurallarını yönet', scopes: ONLY_ALL },
      { code: 'workflow.design', label: 'BPMN akışlarını tasarla', scopes: ONLY_ALL },
      { code: 'erp.manage', label: 'Netsis senkronunu yönet', scopes: ONLY_ALL },
      { code: 'chat.audit', label: 'Sohbet arşivi (tüm sohbetler, silinen mesajlar)', scopes: ONLY_ALL },
    ],
  },
];

export const PERMISSION_BY_CODE = new Map(PERMISSION_CATALOG.flatMap((m) => m.permissions.map((p) => [p.code, p] as const)));

/** Tüm yetkileri her zaman tam kapsamla taşıyan rol; düzenlenemez, silinemez. */
export const ADMIN_ROLE = 'Admin';
