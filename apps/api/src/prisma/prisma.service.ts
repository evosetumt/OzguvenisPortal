import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

/**
 * Model → canlı güncelleme konusu. Bir modele yazılınca o konuyu gösteren ekranlar (tarayıcı ve mobil) verisini
 * kendiliğinden yeniden çeker. Listede olmayan modeller (denetim kaydı, teslim logları, cihaz jetonları, eşitleme
 * kayıtları...) duyurulmaz.
 */
const TOPICS: Record<string, string[]> = {
  tasks: ['Task', 'TaskStatus', 'TaskSubtask', 'TaskComment', 'TaskWatcher', 'Project', 'ProjectMember'],
  meetings: ['Meeting', 'MeetingNote', 'MeetingParticipant', 'Call', 'CallParticipant'],
  calendar: ['CalendarEvent', 'CalendarEventAttendee'],
  users: ['User', 'UserRole', 'Role', 'RolePermission', 'Department'],
  erp: ['ErpCustomer', 'ErpAccountTx', 'ErpOrder', 'ErpOrderItem', 'ErpQuote', 'ErpQuoteItem', 'ErpShipment'],
  expenses: ['Expense', 'ExpenseCategory', 'ExpenseReceipt', 'ExpenseApproval'],
  process: ['ProcessDefinition', 'ProcessInstance', 'ProcessTask', 'ProcessEvent'],
  payments: ['Payment'],
  tracking: ['Vehicle', 'VehicleService', 'TrackedItem', 'TrackedItemReminder', 'TrackedItemAttachment'],
  whatsapp: ['WhatsappContact', 'WhatsappMessage'],
  settings: ['NotificationRule', 'UserNotificationPref', 'Setting'],
};
const TOPIC_OF = new Map(Object.entries(TOPICS).flatMap(([topic, models]) => models.map((m) => [m, topic] as const)));
/** Ekranda gösterilmeyen alanlar: yalnız bunları değiştiren yazım duyurulmaz (her girişte herkes yenilemesin). */
const SILENT_FIELDS: Record<string, Set<string>> = { User: new Set(['lastLoginAt', 'updatedAt']) };
// Netsis eşitlemesi binlerce satır yazar: bu konular en fazla bu sıklıkta duyurulur.
const SLOW_TOPICS: Record<string, number> = { erp: 10_000 };
const FLUSH_MS = 400;

export const topicOf = (model: string) => TOPIC_OF.get(model) ?? null;

const onlySilentFields = (model: string, data: unknown) => {
  const silent = SILENT_FIELDS[model];
  return !!silent && !!data && typeof data === 'object' && Object.keys(data).every((k) => silent.has(k));
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly writeListeners = new Set<(topics: string[]) => void>();
  private pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lastSent = new Map<string, number>();

  async onModuleInit() {
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model && WRITES.has(params.action) && !onlySilentFields(params.model, params.args?.data)) {
        const topic = topicOf(params.model);
        if (topic) this.queue(topic);
      }
      return result;
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Veri değişikliği dinleyicisi (RealtimeGateway bunu istemcilere "data:changed" olarak iletir). */
  onWrite(fn: (topics: string[]) => void) {
    this.writeListeners.add(fn);
  }

  private queue(topic: string) {
    this.pending.add(topic);
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    this.flushTimer = null;
    const now = Date.now();
    const ready: string[] = [];
    for (const t of this.pending) {
      const gap = SLOW_TOPICS[t] ?? 0;
      if (gap && now - (this.lastSent.get(t) ?? 0) < gap) continue; // sonra tekrar denenir
      ready.push(t);
      this.lastSent.set(t, now);
    }
    for (const t of ready) this.pending.delete(t);
    if (this.pending.size) this.flushTimer = setTimeout(() => this.flush(), 1000);
    if (ready.length) for (const fn of this.writeListeners) fn(ready);
  }
}
