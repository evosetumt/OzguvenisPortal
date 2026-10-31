import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NetsisClient } from './netsis.client';
import {
  ORDER_KIND, Q_ACCOUNT_TX, Q_CUSTOMERS, Q_ORDER_ITEMS, Q_ORDERS, Q_QUOTE_ITEMS, Q_QUOTES, Q_SHIPMENTS, Q_SHIPPED_QTY,
  SHIP_DOC_TYPE, SHIP_KIND,
  CLOSED_FLAGS,
} from './netsis.queries';

export const ENTITIES = ['customers', 'account_tx', 'orders', 'quotes', 'shipments'] as const;
type Entity = (typeof ENTITIES)[number];

export const ORDER_STATUS_LABEL: Record<string, string> = { open: 'Açık', partial: 'Kısmi sevk', shipped: 'Sevk edildi', closed: 'Kapandı' };

interface CustRow { code: string; name: string; type: string | null; taxOffice: string | null; taxNo: string | null; phone: string | null; email: string | null; city: string | null; address: string | null; repCode: string | null; updatedAt: Date | null; debit: number; credit: number }
interface TxRow { id: number; customerCode: string; date: Date; dueDate: Date | null; docNo: string | null; description: string | null; txType: string | null; debit: number; credit: number; repCode: string | null }
interface DocRow { ftirsip: string; docNo: string; customerCode: string; date: Date; dueDate: Date | null; description: string | null; gross: number; vat: number; total: number; repCode: string | null; closed: string | null; createdAt: Date | null; updatedAt: Date | null }
interface ItemRow { ftirsip?: string; docNo: string; lineNo: number; stockCode: string; stockName: string | null; unit: string | null; qty: number; unitPrice: number; vatRate: number }
interface ShippedRow { orderNo: string; stockCode: string; ftirsip: string; qty: number }
interface ShipRow { ftirsip: string; docNo: string; customerCode: string; date: Date; total: number; repCode: string | null; createdAt: Date | null; orderNos: string | null }

/** İş emri otomatik kapanışı için yeni belge. */
interface NewDoc { type: 'erp_order' | 'erp_quote'; docNo: string; customerCode: string; createdAt: Date }

const MIN = 60_000;
const DAY = 86_400_000;

const cut = (s: string | null | undefined, n: number) => (s ? s.trim().slice(0, n) || null : null);
const norm = (s: string | null | undefined) => (s ?? '').trim().toLocaleUpperCase('tr-TR');
const r2 = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100) / 100;
const r3 = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 1000) / 1000;
const r4 = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 10000) / 10000;
const t = (d: Date | null | undefined) => (d ? new Date(d).getTime() : null);
function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
/** Belgenin Netsis'e giriş anı: KAYITTARIHI yoksa belge tarihinin gün sonu. */
const docCreatedAt = (d: DocRow) => d.createdAt ?? new Date(new Date(d.date).getTime() + DAY - 1);

/**
 * Netsis → portal önbellek senkronu. Netsis'e YAZMAZ.
 * - Cariler her çalışmada tümüyle, diğer kayıtlar ERP_SYNC_WINDOW_DAYS penceresinde karşılaştırılarak güncellenir;
 *   pencerede olup Netsis'te artık bulunmayan kayıtlar önbellekten silinir.
 * - İlk tam aktarımda olay üretilmez (bildirim seli olmasın); sonraki çalışmalarda yeni/değişen kayıtlar olay üretir.
 * - Yeni satış siparişi / teklif, eşleşen açık iş emri görevlerini otomatik tamamlar.
 */
@Injectable()
export class ErpSyncService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    private readonly netsis: NetsisClient,
  ) {}

  get intervalMinutes() {
    const v = Number(process.env.ERP_SYNC_MINUTES ?? 10);
    return Number.isFinite(v) && v >= 0 ? v : 10;
  }

  get windowDays() {
    const v = Number(process.env.ERP_SYNC_WINDOW_DAYS ?? 365);
    return Number.isFinite(v) && v > 0 ? v : 365;
  }

  get isRunning() {
    return !!this.running;
  }

  onModuleInit() {
    const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Alıcılar: belgenin plasiyer koduna sahip kullanıcılar (senkron sırasında hesaplanıp olaya eklenir).
    this.notifications.registerRule('order.created', {
      label: 'Netsis: yeni sipariş',
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'order.created', title: `Yeni ${p.kind === 'sales' ? 'müşteri' : 'satıcı'} siparişi: ${p.docNo}`, body: `${p.customerName} · ${fmt(p.total)} TL`, link: `/orders?order=${p.orderId}` },
      }),
    });
    this.notifications.registerRule('order.status_changed', {
      label: 'Netsis: sipariş durumu değişti',
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'order.status_changed', title: `Sipariş ${p.docNo}: ${ORDER_STATUS_LABEL[p.to] ?? p.to}`, body: `${p.customerName} · ${ORDER_STATUS_LABEL[p.from] ?? p.from} → ${ORDER_STATUS_LABEL[p.to] ?? p.to}`, link: `/orders?order=${p.orderId}` },
      }),
    });
    this.notifications.registerRule('quote.created', {
      label: 'Netsis: yeni teklif',
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'quote.created', title: `Yeni teklif: ${p.docNo}`, body: `${p.customerName} · ${fmt(p.total)} TL`, link: `/orders?tab=quotes&quote=${p.quoteId}` },
      }),
    });
    this.notifications.registerRule('shipment.dispatched', {
      label: 'Netsis: sevkiyat yapıldı',
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'shipment.dispatched', title: `Sevk edildi: ${p.docNo}`, body: `${p.customerName}${p.orderNos ? ` · Sipariş ${p.orderNos}` : ''}`, link: '/orders?tab=shipments' },
      }),
    });
    this.notifications.registerRule('task.completed_via_erp', {
      label: "İş emri Netsis'te tamamlandı",
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: [p.createdById, p.assigneeId],
        n: { type: 'task.completed_via_erp', title: "İş emri Netsis'te tamamlandı", body: `${p.title} · ${p.docType === 'erp_order' ? 'Sipariş' : 'Teklif'} ${p.docNo}`, link: `/tasks?id=${p.taskId}` },
      }),
    });
  }

  onApplicationBootstrap() {
    if (!this.netsis.configured || this.intervalMinutes === 0) return;
    setTimeout(() => void this.trigger('schedule'), 20_000).unref();
    this.timer = setInterval(() => void this.trigger('schedule'), this.intervalMinutes * MIN);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Senkronu başlatır; zaten çalışıyorsa yenisini başlatmaz (false döner). */
  trigger(trigger: 'schedule' | 'manual'): boolean {
    if (this.running || !this.netsis.configured) return false;
    this.running = this.runAll(trigger).finally(() => (this.running = null));
    return true;
  }

  /** Çalışan senkronun bitmesini bekler (testler ve kapanış için). */
  async wait() {
    await this.running;
  }

  private async runAll(trigger: 'schedule' | 'manual') {
    const from = new Date(Date.now() - this.windowDays * DAY);
    from.setHours(0, 0, 0, 0);
    const ctx = await this.context();
    const steps: Record<Entity, (first: boolean) => Promise<number>> = {
      customers: () => this.syncCustomers(),
      account_tx: () => this.syncAccountTx(from),
      orders: (first) => this.syncOrders(from, first, ctx),
      quotes: (first) => this.syncQuotes(from, first, ctx),
      shipments: (first) => this.syncShipments(from, first, ctx),
    };
    for (const entity of ENTITIES) {
      // Olay üretiminde cari adları güncel olsun diye cariler önce senkronlanır.
      if (entity === 'account_tx') ctx.names = await this.customerNames();
      const run = await this.prisma.erpSyncRun.create({ data: { entity, trigger } });
      try {
        const state = await this.prisma.erpSyncState.findUnique({ where: { entity } });
        const rows = await steps[entity](!state?.cursor);
        const now = new Date().toISOString();
        await this.prisma.erpSyncState.upsert({ where: { entity }, update: { cursor: now }, create: { entity, cursor: now } });
        await this.prisma.erpSyncRun.update({ where: { id: run.id }, data: { status: 'ok', rows, finishedAt: new Date() } });
      } catch (e) {
        console.error(`Netsis senkronu başarısız (${entity})`, e);
        await this.prisma.erpSyncRun.update({
          where: { id: run.id },
          data: { status: 'failed', finishedAt: new Date(), error: String((e as Error)?.message ?? e).slice(0, 2000) },
        });
      }
    }
    await this.autoClose(ctx.newDocs);
  }

  /** Bir çalışma boyunca paylaşılan bilgiler: plasiyer → kullanıcı eşlemesi, cari adları, yeni belgeler. */
  private async context() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', erpRepCode: { not: null } },
      select: { id: true, erpRepCode: true },
    });
    const byRep = new Map<string, number[]>();
    for (const u of users) {
      const k = norm(u.erpRepCode);
      if (k) byRep.set(k, [...(byRep.get(k) ?? []), u.id]);
    }
    return { byRep, names: new Map<string, string>(), newDocs: [] as NewDoc[] };
  }

  private async customerNames() {
    const rows = await this.prisma.erpCustomer.findMany({ select: { code: true, name: true } });
    return new Map(rows.map((r) => [norm(r.code), r.name]));
  }

  // ---------- Cariler ----------

  private async syncCustomers() {
    const rows = await this.netsis.query<CustRow>(Q_CUSTOMERS);
    const existing = new Map((await this.prisma.erpCustomer.findMany()).map((c) => [c.code, c]));
    const seen = new Set<string>();
    const creates: Prisma.ErpCustomerCreateManyInput[] = [];
    for (const r of rows) {
      const code = cut(r.code, 35);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const debit = r2(r.debit), credit = r2(r.credit);
      const data = {
        name: cut(r.name, 200) ?? code, type: cut(r.type, 5), taxOffice: cut(r.taxOffice, 100), taxNo: cut(r.taxNo, 30),
        phone: cut(r.phone, 40), email: cut(r.email, 150), city: cut(r.city, 60), address: cut(r.address, 400),
        repCode: cut(r.repCode, 20), debit, credit, balance: r2(debit - credit), erpUpdatedAt: r.updatedAt ?? null,
      };
      const old = existing.get(code);
      if (!old) { creates.push({ code, ...data }); continue; }
      const changed = old.name !== data.name || old.type !== data.type || old.taxOffice !== data.taxOffice || old.taxNo !== data.taxNo
        || old.phone !== data.phone || old.email !== data.email || old.city !== data.city || old.address !== data.address
        || old.repCode !== data.repCode || Number(old.debit) !== debit || Number(old.credit) !== credit
        || t(old.erpUpdatedAt) !== t(data.erpUpdatedAt);
      if (changed) await this.prisma.erpCustomer.update({ where: { code }, data: { ...data, syncedAt: new Date() } });
    }
    // SQL Server en fazla 2100 parametre kabul eder; toplu işlemler parçalara bölünür.
    for (const part of chunks(creates, 100)) await this.prisma.erpCustomer.createMany({ data: part });
    const gone = [...existing.keys()].filter((c) => !seen.has(c));
    for (const part of chunks(gone, 1000)) await this.prisma.erpCustomer.deleteMany({ where: { code: { in: part } } });
    return rows.length;
  }

  // ---------- Cari hareketler (ekstre) ----------

  private async syncAccountTx(from: Date) {
    const rows = await this.netsis.query<TxRow>(Q_ACCOUNT_TX, { from });
    const data = rows.map((r) => ({
      id: r.id, customerCode: cut(r.customerCode, 35) ?? '', date: r.date, dueDate: r.dueDate ?? null, docNo: cut(r.docNo, 30),
      description: cut(r.description, 200), txType: cut(r.txType, 5), debit: r2(r.debit), credit: r2(r.credit), repCode: cut(r.repCode, 20),
    }));
    // Pencere yeniden yazılır; ekstre bu süre boyunca tutarlı görünsün diye tek işlemde.
    await this.prisma.$transaction(async (tx) => {
      await tx.erpAccountTx.deleteMany({ where: { date: { gte: from } } });
      for (const part of chunks(data, 150)) {
        await tx.erpAccountTx.deleteMany({ where: { id: { in: part.map((x) => x.id) } } }); // tarihi pencereye taşınan eski kayıt
        await tx.erpAccountTx.createMany({ data: part });
      }
    }, { timeout: 300_000, maxWait: 30_000 });
    return rows.length;
  }

  // ---------- Siparişler ----------

  private async syncOrders(from: Date, first: boolean, ctx: Awaited<ReturnType<ErpSyncService['context']>>) {
    const [heads, items, shipped] = await Promise.all([
      this.netsis.query<DocRow>(Q_ORDERS, { from }),
      this.netsis.query<ItemRow>(Q_ORDER_ITEMS, { from }),
      this.netsis.query<ShippedRow>(Q_SHIPPED_QTY, { from }),
    ]);

    // (tür, sipariş no, stok) → sevk miktarı: irsaliye ve fatura toplamlarının büyüğü (çift sayım olmasın)
    const shipAgg = new Map<string, { inv: number; wb: number }>();
    for (const s of shipped) {
      const kind = SHIP_KIND[s.ftirsip];
      if (!kind) continue;
      const k = `${kind}|${norm(s.orderNo)}|${norm(s.stockCode)}`;
      const a = shipAgg.get(k) ?? { inv: 0, wb: 0 };
      if (s.ftirsip === '1' || s.ftirsip === '2') a.inv += Number(s.qty); else a.wb += Number(s.qty);
      shipAgg.set(k, a);
    }
    const itemsBy = new Map<string, ItemRow[]>();
    for (const it of items) {
      const kind = ORDER_KIND[it.ftirsip ?? ''];
      if (!kind) continue;
      const k = `${kind}|${norm(it.docNo)}`;
      itemsBy.set(k, [...(itemsBy.get(k) ?? []), it]);
    }

    const existing = await this.prisma.erpOrder.findMany({ where: { date: { gte: from } }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    const byKey = new Map(existing.map((o) => [`${o.kind}|${norm(o.docNo)}`, o]));
    const seen = new Set<number>();

    for (const h of heads) {
      const kind = ORDER_KIND[h.ftirsip];
      const docNo = cut(h.docNo, 30);
      if (!kind || !docNo) continue;
      const key = `${kind}|${norm(docNo)}`;

      // Sevk edilen miktarı aynı stoklu satırlara sırayla dağıt.
      const remaining = new Map<string, number>();
      const lines = (itemsBy.get(key) ?? []).sort((a, b) => a.lineNo - b.lineNo).map((it, i) => {
        const sk = norm(it.stockCode);
        if (!remaining.has(sk)) {
          const a = shipAgg.get(`${kind}|${norm(docNo)}|${sk}`);
          remaining.set(sk, a ? Math.max(a.inv, a.wb) : 0);
        }
        const qty = r3(Math.abs(it.qty));
        const shippedQty = r3(Math.min(qty, remaining.get(sk)!));
        remaining.set(sk, remaining.get(sk)! - shippedQty);
        return {
          lineNo: it.lineNo || i + 1, stockCode: cut(it.stockCode, 40) ?? '', stockName: cut(it.stockName, 200), unit: cut(it.unit, 20),
          qty, shippedQty, unitPrice: r4(it.unitPrice), vatRate: r2(it.vatRate),
        };
      });
      const totalQty = r3(lines.reduce((n, l) => n + l.qty, 0));
      const shippedQty = r3(lines.reduce((n, l) => n + l.shippedQty, 0));
      // Tam sevk edilen sipariş Netsis'te kapatılmış olsa da "sevk edildi" gösterilir.
      const status = totalQty > 0 && shippedQty >= totalQty ? 'shipped'
        : CLOSED_FLAGS.includes(norm(h.closed)) ? 'closed'
        : shippedQty > 0 ? 'partial' : 'open';

      const data = {
        customerCode: cut(h.customerCode, 35) ?? '', date: h.date, dueDate: h.dueDate ?? null, description: cut(h.description, 200),
        gross: r2(h.gross), vat: r2(h.vat), total: r2(h.total), repCode: cut(h.repCode, 20), status, totalQty, shippedQty,
        erpCreatedAt: h.createdAt ?? null, erpUpdatedAt: h.updatedAt ?? null,
      };
      let old = byKey.get(key) ?? null;
      if (!old) old = await this.prisma.erpOrder.findUnique({ where: { kind_docNo: { kind, docNo } }, include: { items: { orderBy: { lineNo: 'asc' } } } });

      if (!old) {
        const o = await this.prisma.erpOrder.create({ data: { kind, docNo, ...data, items: { create: lines } } });
        seen.add(o.id);
        if (kind === 'sales') ctx.newDocs.push({ type: 'erp_order', docNo, customerCode: data.customerCode, createdAt: docCreatedAt(h) });
        if (!first) {
          this.events.emit('order.created', null, {
            orderId: o.id, docNo, kind, customerCode: data.customerCode, customerName: ctx.names.get(norm(data.customerCode)) ?? data.customerCode,
            total: data.total, repCode: data.repCode, recipientIds: ctx.byRep.get(norm(data.repCode)) ?? [],
          });
        }
        continue;
      }
      seen.add(old.id);
      const oldLines = JSON.stringify(old.items.map((l) => [l.lineNo, l.stockCode, l.stockName, l.unit, Number(l.qty), Number(l.shippedQty), Number(l.unitPrice), Number(l.vatRate)]));
      const newLines = JSON.stringify(lines.map((l) => [l.lineNo, l.stockCode, l.stockName, l.unit, l.qty, l.shippedQty, l.unitPrice, l.vatRate]));
      const headChanged = old.customerCode !== data.customerCode || t(old.date) !== t(data.date) || t(old.dueDate) !== t(data.dueDate)
        || old.description !== data.description || Number(old.gross) !== data.gross || Number(old.vat) !== data.vat || Number(old.total) !== data.total
        || old.repCode !== data.repCode || old.status !== data.status || Number(old.totalQty) !== totalQty || Number(old.shippedQty) !== shippedQty
        || t(old.erpUpdatedAt) !== t(data.erpUpdatedAt);
      if (!headChanged && oldLines === newLines) continue;
      await this.prisma.$transaction([
        this.prisma.erpOrder.update({ where: { id: old.id }, data: { ...data, syncedAt: new Date() } }),
        ...(oldLines !== newLines ? [
          this.prisma.erpOrderItem.deleteMany({ where: { orderId: old.id } }),
          this.prisma.erpOrderItem.createMany({ data: lines.map((l) => ({ ...l, orderId: old!.id })) }),
        ] : []),
      ]);
      if (!first && old.status !== status) {
        this.events.emit('order.status_changed', null, {
          orderId: old.id, docNo, kind, from: old.status, to: status, customerCode: data.customerCode,
          customerName: ctx.names.get(norm(data.customerCode)) ?? data.customerCode, repCode: data.repCode,
          recipientIds: ctx.byRep.get(norm(data.repCode)) ?? [],
        });
      }
    }
    const gone = existing.filter((o) => !seen.has(o.id)).map((o) => o.id);
    for (const part of chunks(gone, 1000)) await this.prisma.erpOrder.deleteMany({ where: { id: { in: part } } });
    return heads.length;
  }

  // ---------- Teklifler ----------

  private async syncQuotes(from: Date, first: boolean, ctx: Awaited<ReturnType<ErpSyncService['context']>>) {
    const [heads, items] = await Promise.all([
      this.netsis.query<DocRow>(Q_QUOTES, { from }),
      this.netsis.query<ItemRow>(Q_QUOTE_ITEMS, { from }),
    ]);
    const itemsBy = new Map<string, ItemRow[]>();
    for (const it of items) {
      const k = norm(it.docNo);
      itemsBy.set(k, [...(itemsBy.get(k) ?? []), it]);
    }
    const existing = await this.prisma.erpQuote.findMany({ where: { date: { gte: from } }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    const byKey = new Map(existing.map((q) => [norm(q.docNo), q]));
    const seen = new Set<number>();
    const done = new Set<string>();

    for (const h of heads) {
      const docNo = cut(h.docNo, 30);
      if (!docNo || done.has(norm(docNo))) continue; // aynı numara farklı tipte tekrar ederse ilki
      done.add(norm(docNo));
      const lines = (itemsBy.get(norm(docNo)) ?? []).sort((a, b) => a.lineNo - b.lineNo).map((it, i) => ({
        lineNo: it.lineNo || i + 1, stockCode: cut(it.stockCode, 40) ?? '', stockName: cut(it.stockName, 200), unit: cut(it.unit, 20),
        qty: r3(Math.abs(it.qty)), unitPrice: r4(it.unitPrice), vatRate: r2(it.vatRate),
      }));
      const data = {
        customerCode: cut(h.customerCode, 35) ?? '', date: h.date, description: cut(h.description, 200),
        gross: r2(h.gross), vat: r2(h.vat), total: r2(h.total), repCode: cut(h.repCode, 20),
        status: CLOSED_FLAGS.includes(norm(h.closed)) ? 'closed' : 'open', erpCreatedAt: h.createdAt ?? null, erpUpdatedAt: h.updatedAt ?? null,
      };
      let old = byKey.get(norm(docNo)) ?? null;
      if (!old) old = await this.prisma.erpQuote.findUnique({ where: { docNo }, include: { items: { orderBy: { lineNo: 'asc' } } } });
      if (!old) {
        const q = await this.prisma.erpQuote.create({ data: { docNo, ...data, items: { create: lines } } });
        seen.add(q.id);
        ctx.newDocs.push({ type: 'erp_quote', docNo, customerCode: data.customerCode, createdAt: docCreatedAt(h) });
        if (!first) {
          this.events.emit('quote.created', null, {
            quoteId: q.id, docNo, customerCode: data.customerCode, customerName: ctx.names.get(norm(data.customerCode)) ?? data.customerCode,
            total: data.total, repCode: data.repCode, recipientIds: ctx.byRep.get(norm(data.repCode)) ?? [],
          });
        }
        continue;
      }
      seen.add(old.id);
      const oldLines = JSON.stringify(old.items.map((l) => [l.lineNo, l.stockCode, l.stockName, l.unit, Number(l.qty), Number(l.unitPrice), Number(l.vatRate)]));
      const newLines = JSON.stringify(lines.map((l) => [l.lineNo, l.stockCode, l.stockName, l.unit, l.qty, l.unitPrice, l.vatRate]));
      const headChanged = old.customerCode !== data.customerCode || t(old.date) !== t(data.date) || old.description !== data.description
        || Number(old.gross) !== data.gross || Number(old.vat) !== data.vat || Number(old.total) !== data.total || old.repCode !== data.repCode
        || old.status !== data.status || t(old.erpUpdatedAt) !== t(data.erpUpdatedAt);
      if (!headChanged && oldLines === newLines) continue;
      await this.prisma.$transaction([
        this.prisma.erpQuote.update({ where: { id: old.id }, data: { ...data, syncedAt: new Date() } }),
        ...(oldLines !== newLines ? [
          this.prisma.erpQuoteItem.deleteMany({ where: { quoteId: old.id } }),
          this.prisma.erpQuoteItem.createMany({ data: lines.map((l) => ({ ...l, quoteId: old!.id })) }),
        ] : []),
      ]);
    }
    const gone = existing.filter((q) => !seen.has(q.id)).map((q) => q.id);
    for (const part of chunks(gone, 1000)) await this.prisma.erpQuote.deleteMany({ where: { id: { in: part } } });
    return heads.length;
  }

  // ---------- Sevkiyatlar ----------

  private async syncShipments(from: Date, first: boolean, ctx: Awaited<ReturnType<ErpSyncService['context']>>) {
    const rows = await this.netsis.query<ShipRow>(Q_SHIPMENTS, { from });
    const existing = await this.prisma.erpShipment.findMany({ where: { date: { gte: from } } });
    const byKey = new Map(existing.map((s) => [`${s.docType}|${norm(s.docNo)}`, s]));
    const seen = new Set<number>();
    for (const r of rows) {
      const docType = SHIP_DOC_TYPE[r.ftirsip];
      const docNo = cut(r.docNo, 30);
      if (!docType || !docNo) continue;
      const orderNos = r.orderNos ? [...new Set(r.orderNos.split(',').map((x) => x.trim()).filter(Boolean))].join(',').slice(0, 500) : null;
      const data = {
        customerCode: cut(r.customerCode, 35) ?? '', date: r.date, orderNos, total: r2(r.total), repCode: cut(r.repCode, 20), erpCreatedAt: r.createdAt ?? null,
      };
      let old = byKey.get(`${docType}|${norm(docNo)}`) ?? null;
      if (!old) old = await this.prisma.erpShipment.findUnique({ where: { docType_docNo: { docType, docNo } } });
      if (!old) {
        const s = await this.prisma.erpShipment.create({ data: { docType, docNo, ...data } });
        seen.add(s.id);
        if (!first) {
          this.events.emit('shipment.dispatched', null, {
            shipmentId: s.id, docNo, docType, orderNos, customerCode: data.customerCode,
            customerName: ctx.names.get(norm(data.customerCode)) ?? data.customerCode, repCode: data.repCode,
            recipientIds: ctx.byRep.get(norm(data.repCode)) ?? [],
          });
        }
        continue;
      }
      seen.add(old.id);
      const changed = old.customerCode !== data.customerCode || t(old.date) !== t(data.date) || old.orderNos !== data.orderNos
        || Number(old.total) !== data.total || old.repCode !== data.repCode;
      if (changed) await this.prisma.erpShipment.update({ where: { id: old.id }, data: { ...data, syncedAt: new Date() } });
    }
    const gone = existing.filter((s) => !seen.has(s.id)).map((s) => s.id);
    for (const part of chunks(gone, 1000)) await this.prisma.erpShipment.deleteMany({ where: { id: { in: part } } });
    return rows.length;
  }

  // ---------- İş emri otomatik kapanışı ----------

  /**
   * Yeni Netsis belgesi (satış siparişi / teklif), aynı cari için açılmış ve henüz bitmemiş iş emri görevini tamamlar.
   * Eşleşme: görev türü belge türüyle aynı, customerRef = cari kodu, erpDocNo boş veya belge no ile aynı,
   * belge görevden SONRA Netsis'e girilmiş. Her belge en fazla bir görevi, en eski görevden başlayarak kapatır.
   */
  async autoClose(docs: NewDoc[]) {
    if (!docs.length) return 0;
    const done = await this.prisma.taskStatus.findFirst({ where: { projectId: null, isDone: true }, orderBy: { sortOrder: 'asc' } });
    if (!done) return 0;
    let open = await this.prisma.task.findMany({
      where: { deletedAt: null, taskType: { in: ['erp_order', 'erp_quote'] }, customerRef: { not: null }, status: { isDone: false } },
      select: { id: true, title: true, taskType: true, customerRef: true, erpDocNo: true, createdAt: true, createdById: true, assigneeId: true },
      orderBy: { createdAt: 'asc' },
    });
    let closed = 0;
    for (const doc of [...docs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const task = open.find((x) => x.taskType === doc.type && norm(x.customerRef) === norm(doc.customerCode)
        && (!x.erpDocNo?.trim() || norm(x.erpDocNo) === norm(doc.docNo)) && doc.createdAt >= x.createdAt);
      if (!task) continue;
      open = open.filter((x) => x.id !== task.id);
      const now = new Date();
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          statusId: done.id, completedAt: now, completedViaErp: true, relatedType: doc.type, relatedId: doc.docNo,
          erpDocNo: task.erpDocNo?.trim() ? undefined : doc.docNo,
        },
      });
      await this.prisma.auditLog.create({
        data: { userId: null, action: 'task.erp_complete', entity: 'task', entityId: String(task.id), diff: JSON.stringify({ docType: doc.type, docNo: doc.docNo, customerCode: doc.customerCode }) },
      });
      this.events.emit('task.completed_via_erp', null, {
        taskId: task.id, title: task.title, createdById: task.createdById, assigneeId: task.assigneeId, docType: doc.type, docNo: doc.docNo,
      });
      closed++;
    }
    return closed;
  }
}
