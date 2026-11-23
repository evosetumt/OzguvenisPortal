import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventsService, PortalEvent } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { fmtDateTr } from '../common/format';
import { FEED_TASK_RELATION, FeedService } from './feed.service';

type Payload = Record<string, unknown>;

const ORDER_STATUS: Record<string, string> = { open: 'Açık', partial: 'Kısmi sevk', shipped: 'Sevk edildi', closed: 'Kapandı' };
const orderWord = (kind: unknown) => (kind === 'purchase' ? 'satın alma siparişi' : 'satış siparişi');
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? ` · ${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺` : '';
};
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const orderList = (v: unknown) => (Array.isArray(v) && v.length ? ` (sipariş ${v.slice(0, 5).map(str).join(', ')})` : '');
const statusLabel = (v: unknown) => ORDER_STATUS[str(v)] ?? str(v);

/** Netsis olayları → kart: [olay, kart türü, ilgili kayıt türü, metin]. */
const ERP_CARDS: [string, string, string, (p: Payload) => string][] = [
  ['order.created', 'order_created', 'order', (p) => `Yeni ${orderWord(p.kind)}: ${str(p.docNo)}${money(p.total)}`],
  ['order.status_changed', 'order_status', 'order',
    (p) => `${str(p.docNo)} ${orderWord(p.kind)} durumu değişti: ${statusLabel(p.from)} → ${statusLabel(p.to)}`],
  ['quote.created', 'quote_created', 'quote', (p) => `Yeni satış teklifi: ${str(p.docNo)}${money(p.total)}`],
  ['shipment.dispatched', 'shipment', 'shipment', (p) => `Sevkiyat yapıldı: ${str(p.docNo)}${orderList(p.orderNos)}`],
];

const taskSelect = {
  id: true, title: true, assigneeId: true, createdById: true, customerRef: true, relatedType: true, relatedId: true,
  dueDate: true, deletedAt: true, assignee: { select: { fullName: true } },
} as const;

/**
 * Modül olaylarını akış kartına çevirir (ekran görüntüsündeki "satış fırsatının aşaması değişti" kartlarının karşılığı).
 * Netsis olaylarının kartı plasiyer koduyla eşlenen kullanıcıların (recipientIds) akışına düşer.
 */
@Injectable()
export class FeedEventsService implements OnModuleInit {
  constructor(private readonly events: EventsService, private readonly feed: FeedService, private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Sistemin açtığı görevler (actorId boş: onay akışı, ödeme) "yeni görev" kartı üretmez.
    this.events.on('task.created', (e) => (e.actorId ? this.taskCard(e, 'task_created') : undefined));
    this.events.on('task.completed', (e) => this.taskCard(e, 'task_completed'));
    for (const [code, kind, relatedType, body] of ERP_CARDS) {
      this.events.on(code, (e) => this.erp(e, kind, relatedType, body(e.payload)));
    }
  }

  /**
   * Görev kartı. Karttan açılan aktivite ayrı kart üretmez (kartın altında listelenir); bunun yerine ait olduğu kart
   * dokunulup güncellenir, böylece açık akışlar aktivitenin yeni durumunu görür.
   */
  private async taskCard(e: PortalEvent, kind: 'task_created' | 'task_completed') {
    const taskId = Number(e.payload.taskId);
    if (!taskId) return;
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: taskSelect });
    if (!t || t.deletedAt) return;
    if (t.relatedType === FEED_TASK_RELATION) {
      await this.feed.touch(Number(t.relatedId));
      return;
    }
    // Geri alınıp yeniden tamamlanan görev akışa ikinci kez düşmez.
    if (await this.feed.hasCard(kind, 'task', t.id)) return;
    const who = t.assignee && t.assigneeId !== e.actorId ? ` · Sorumlu: ${t.assignee.fullName}` : '';
    const due = t.dueDate ? ` · Bitiş: ${fmtDateTr(t.dueDate, { year: false })}` : '';
    await this.feed.system({
      kind,
      authorId: e.actorId,
      audience: [t.assigneeId, t.createdById],
      body: kind === 'task_created' ? `Yeni görev açıldı: “${t.title}”${who}${due}` : `“${t.title}” görevi tamamlandı.`,
      customerCode: t.customerRef,
      relatedType: 'task',
      relatedId: t.id,
      relatedLabel: `${t.title} (#${t.id})`,
    });
  }

  private async erp(e: PortalEvent, kind: string, relatedType: string, body: string) {
    const p = e.payload;
    const id = p.orderId ?? p.quoteId ?? p.shipmentId;
    await this.feed.system({
      kind,
      authorId: null,
      audience: ids(p.recipientIds),
      body,
      customerCode: str(p.customerCode) || null,
      customerName: str(p.customerName) || null,
      relatedType,
      relatedId: id === undefined ? undefined : str(id),
      relatedLabel: str(p.docNo) || null,
    });
  }
}
