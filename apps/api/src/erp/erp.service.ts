import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf } from '../common/scope';
import { CalendarService } from '../calendar/calendar.service';
import { ErpScope } from './erp-scope';
import { ErpSyncService } from './erp-sync.service';
import { NetsisClient } from './netsis.client';
import { EDocumentService, invoiceDirection } from './edocument.service';
import { AuditService } from '../common/audit.service';
import { Q_PING } from './netsis.queries';

/** Prisma Decimal alanlarını JSON için sayıya çevirir (iç içe nesne/dizi dahil). */
export function plain<T>(x: T): any {
  if (x === null || x === undefined || x instanceof Date) return x;
  if (Prisma.Decimal.isDecimal(x)) return Number(x);
  if (Array.isArray(x)) return x.map(plain);
  if (typeof x === 'object') return Object.fromEntries(Object.entries(x as object).map(([k, v]) => [k, plain(v)]));
  return x;
}

/** Yerel tarih → aynı günün UTC gece yarısı (takvimde tam gün öğeleri doğru güne düşsün). */
const utcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export interface ListFilter { q?: string; status?: string; kind?: string; from?: Date; to?: Date; customerCode?: string }

@Injectable()
export class ErpService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ErpScope,
    private readonly sync: ErpSyncService,
    private readonly netsis: NetsisClient,
    private readonly calendar: CalendarService,
    private readonly edocs: EDocumentService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.calendar.registerSource((u, from, to) => this.calendarItems(u, from, to));
  }

  // ---------- Senkron durumu ----------

  async status() {
    const [runs, states, customers, orders, quotes, shipments, txs] = await Promise.all([
      this.prisma.erpSyncRun.findMany({ orderBy: { id: 'desc' }, take: 25 }),
      this.prisma.erpSyncState.findMany(),
      this.prisma.erpCustomer.count(),
      this.prisma.erpOrder.count(),
      this.prisma.erpQuote.count(),
      this.prisma.erpShipment.count(),
      this.prisma.erpAccountTx.count(),
    ]);
    return {
      configured: this.netsis.configured,
      connection: this.netsis.describe(),
      intervalMinutes: this.sync.intervalMinutes,
      windowDays: this.sync.windowDays,
      running: this.sync.isRunning,
      lastSync: Object.fromEntries(states.map((s) => [s.entity, s.cursor])),
      counts: { customers, orders, quotes, shipments, accountTx: txs },
      runs,
    };
  }

  async testConnection() {
    try {
      const [r] = await this.netsis.query<{ db: string; version: string }>(Q_PING);
      return { ok: true, database: r?.db, version: r?.version?.split('\n')[0] };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }

  // ---------- Cariler ----------

  private async names(codes: string[]) {
    const uniq = [...new Set(codes.filter(Boolean))];
    const out = new Map<string, string>();
    for (let i = 0; i < uniq.length; i += 1000) {
      const rows = await this.prisma.erpCustomer.findMany({ where: { code: { in: uniq.slice(i, i + 1000) } }, select: { code: true, name: true } });
      for (const r of rows) out.set(r.code.toLocaleUpperCase('tr-TR'), r.name);
    }
    return (code: string) => out.get(code.toLocaleUpperCase('tr-TR')) ?? null;
  }

  /** Arama metniyle eşleşen cari kodları (belge listelerinde cari adına göre arama için). */
  private async codesMatching(q: string) {
    const rows = await this.prisma.erpCustomer.findMany({ where: { name: { contains: q } }, select: { code: true }, take: 300 });
    return rows.map((r) => r.code);
  }

  async customers(u: AuthUser, q?: string, onlyDebtors = false) {
    const where: Prisma.ErpCustomerWhereInput = {
      ...(await this.scope.where(u, 'account.read')),
      ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { taxNo: { contains: q } }] } : {}),
      ...(onlyDebtors ? { balance: { gt: 0 } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.erpCustomer.findMany({ where, orderBy: { name: 'asc' }, take: 300 }),
      this.prisma.erpCustomer.count({ where }),
    ]);
    return { total, items: plain(rows) };
  }

  /** Görev formu için hafif arama: yalnızca kod ve ad. Kapsam: cari/sipariş/teklif/görev izinlerinin en genişi. */
  async lookup(u: AuthUser, q?: string) {
    const codes = await this.scope.repCodes(u, this.scope.widest(u, 'account.read', 'order.read', 'quote.read', 'task.write'));
    return this.prisma.erpCustomer.findMany({
      where: {
        ...(codes ? { repCode: { in: codes } } : {}),
        ...(q ? { OR: [{ code: { startsWith: q } }, { name: { contains: q } }] } : {}),
      },
      select: { code: true, name: true, city: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async customer(u: AuthUser, code: string) {
    const c = await this.prisma.erpCustomer.findFirst({ where: { code, ...(await this.scope.where(u, 'account.read')) } });
    if (!c) throw new NotFoundException('Cari bulunamadı');
    const txs = await this.prisma.erpAccountTx.findMany({ where: { customerCode: c.code }, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
    // Önbellek son N günü tutar; devir = güncel bakiye − penceredeki hareketlerin net etkisi.
    const windowNet = txs.reduce((n, x) => n + Number(x.debit) - Number(x.credit), 0);
    let running = Number(c.balance) - windowNet;
    const opening = Math.round(running * 100) / 100;
    // e-Fatura / e-Arşiv XML'i olan belgeler (ekstrede önizleme düğmesi için; Netsis erişilemezse düğme çıkmaz)
    const withEDoc = await this.edocs.available(txs.filter((x) => x.docNo && (x.txType === 'B' || x.txType === 'C')).map((x) => x.docNo!));
    const statement = txs.map((x) => {
      running += Number(x.debit) - Number(x.credit);
      return { ...plain(x), balance: Math.round(running * 100) / 100, eDoc: !!x.docNo && withEDoc.has(x.docNo) };
    });
    const [orders, quotes] = await Promise.all([
      scopeOf(u, 'order.read')
        ? this.prisma.erpOrder.findMany({ where: { customerCode: c.code, ...(await this.scope.where(u, 'order.read')) }, orderBy: { date: 'desc' }, take: 30 })
        : [],
      scopeOf(u, 'quote.read')
        ? this.prisma.erpQuote.findMany({ where: { customerCode: c.code, ...(await this.scope.where(u, 'quote.read')) }, orderBy: { date: 'desc' }, take: 30 })
        : [],
    ]);
    return { ...plain(c), opening, statement, orders: plain(orders), quotes: plain(quotes) };
  }

  /**
   * e-Belge XML'i: yalnızca cariyi görebilen ve belge bu carinin ekstresinde olan (başka carinin faturası sorgulanamaz).
   * Görüntüleme denetim kaydına yazılır.
   */
  async eDocument(u: AuthUser, code: string, docNo: string) {
    const c = await this.prisma.erpCustomer.findFirst({ where: { code, ...(await this.scope.where(u, 'account.read')) } });
    if (!c) throw new NotFoundException('Cari bulunamadı');
    const tx = await this.prisma.erpAccountTx.findFirst({ where: { customerCode: c.code, docNo }, orderBy: { date: 'desc' } });
    if (!tx) throw new NotFoundException('Belge bu carinin hareketlerinde yok');
    const doc = await this.edocs.get(docNo, { direction: invoiceDirection(tx.description), customerCode: c.code, taxNo: c.taxNo, date: tx.date });
    await this.audit.log(u.id, 'erp.edocument_view', 'erp_document', docNo, { customerCode: c.code, source: doc.source });
    return { ...doc, docNo, customerName: c.name };
  }

  // ---------- Siparişler ----------

  private async docWhere(u: AuthUser, perm: string, f: ListFilter) {
    const and: Record<string, unknown>[] = [await this.scope.where(u, perm)];
    if (f.customerCode) and.push({ customerCode: f.customerCode });
    if (f.from || f.to) and.push({ date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } });
    if (f.q) {
      const codes = await this.codesMatching(f.q);
      and.push({ OR: [{ docNo: { contains: f.q } }, { customerCode: { contains: f.q } }, ...(codes.length ? [{ customerCode: { in: codes } }] : [])] });
    }
    return and;
  }

  async orders(u: AuthUser, f: ListFilter) {
    const and = await this.docWhere(u, 'order.read', f);
    and.push({ kind: f.kind === 'purchase' ? 'purchase' : 'sales' });
    if (f.status === 'active') and.push({ status: { in: ['open', 'partial'] } });
    else if (f.status) and.push({ status: f.status });
    const rows = await this.prisma.erpOrder.findMany({ where: { AND: and as Prisma.ErpOrderWhereInput[] }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 });
    const name = await this.names(rows.map((r) => r.customerCode));
    return plain(rows.map((r) => ({ ...r, customerName: name(r.customerCode) })));
  }

  async order(u: AuthUser, id: number) {
    const o = await this.prisma.erpOrder.findFirst({ where: { id, ...(await this.scope.where(u, 'order.read')) }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    if (!o) throw new NotFoundException('Sipariş bulunamadı');
    const shipments = scopeOf(u, 'shipment.read')
      ? (await this.prisma.erpShipment.findMany({ where: { orderNos: { contains: o.docNo }, ...(await this.scope.where(u, 'shipment.read')) }, orderBy: { date: 'asc' } }))
        .filter((s) => (s.orderNos ?? '').split(',').includes(o.docNo))
      : [];
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, relatedType: 'erp_order', relatedId: o.docNo },
      select: { id: true, title: true },
    });
    const name = await this.names([o.customerCode]);
    return plain({ ...o, customerName: name(o.customerCode), shipments, tasks });
  }

  // ---------- Teklifler ----------

  async quotes(u: AuthUser, f: ListFilter) {
    const and = await this.docWhere(u, 'quote.read', f);
    if (f.status) and.push({ status: f.status });
    const rows = await this.prisma.erpQuote.findMany({ where: { AND: and as Prisma.ErpQuoteWhereInput[] }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 });
    const name = await this.names(rows.map((r) => r.customerCode));
    return plain(rows.map((r) => ({ ...r, customerName: name(r.customerCode) })));
  }

  async quote(u: AuthUser, id: number) {
    const q = await this.prisma.erpQuote.findFirst({ where: { id, ...(await this.scope.where(u, 'quote.read')) }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    if (!q) throw new NotFoundException('Teklif bulunamadı');
    const tasks = await this.prisma.task.findMany({ where: { deletedAt: null, relatedType: 'erp_quote', relatedId: q.docNo }, select: { id: true, title: true } });
    const name = await this.names([q.customerCode]);
    return plain({ ...q, customerName: name(q.customerCode), tasks });
  }

  // ---------- Sevkiyatlar ----------

  async shipments(u: AuthUser, f: ListFilter) {
    const and = await this.docWhere(u, 'shipment.read', f);
    if (f.kind === 'invoice' || f.kind === 'waybill') and.push({ docType: f.kind });
    const rows = await this.prisma.erpShipment.findMany({ where: { AND: and as Prisma.ErpShipmentWhereInput[] }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 });
    const name = await this.names(rows.map((r) => r.customerCode));
    return plain(rows.map((r) => ({ ...r, customerName: name(r.customerCode) })));
  }

  // ---------- Rapor özeti ----------

  /**
   * Yönetim özeti (report.read kapsamında). Vadesi geçmiş alacak yaklaşık hesaptır:
   * vadesi geçmiş borç hareketleri toplamı, carinin güncel bakiyesiyle sınırlanır (ödemeler belge bazında eşlenmez).
   */
  async summary(u: AuthUser) {
    const scope = await this.scope.where(u, 'report.read');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [openAgg, monthAgg, monthShip, quoteAgg, topCustomers, debtors] = await Promise.all([
      this.prisma.erpOrder.aggregate({ where: { ...scope, kind: 'sales', status: { in: ['open', 'partial'] } }, _count: true, _sum: { total: true } }),
      this.prisma.erpOrder.aggregate({ where: { ...scope, kind: 'sales', date: { gte: monthStart } }, _count: true, _sum: { total: true } }),
      this.prisma.erpShipment.count({ where: { ...scope, date: { gte: monthStart } } }),
      this.prisma.erpQuote.aggregate({ where: { ...scope, status: 'open' }, _count: true, _sum: { total: true } }),
      this.prisma.erpCustomer.findMany({ where: { ...scope, balance: { gt: 0 } }, orderBy: { balance: 'desc' }, take: 10, select: { code: true, name: true, balance: true } }),
      this.prisma.erpCustomer.findMany({ where: { ...scope, balance: { gt: 0 } }, select: { code: true, name: true, balance: true } }),
    ]);
    const overdueRaw = await this.prisma.erpAccountTx.groupBy({
      by: ['customerCode'], where: { dueDate: { lt: today }, debit: { gt: 0 } }, _sum: { debit: true },
    });
    const debtorBy = new Map(debtors.map((d) => [d.code, d]));
    const overdue = overdueRaw
      .map((r) => {
        const c = debtorBy.get(r.customerCode);
        return c ? { code: c.code, name: c.name, amount: Math.min(Number(r._sum.debit ?? 0), Number(c.balance)) } : null;
      })
      .filter((x): x is { code: string; name: string; amount: number } => !!x && x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return {
      openOrders: { count: openAgg._count, total: Number(openAgg._sum.total ?? 0) },
      monthOrders: { count: monthAgg._count, total: Number(monthAgg._sum.total ?? 0) },
      monthShipments: monthShip,
      openQuotes: { count: quoteAgg._count, total: Number(quoteAgg._sum.total ?? 0) },
      receivables: debtors.reduce((n, d) => n + Number(d.balance), 0),
      topCustomers: plain(topCustomers),
      overdueTotal: Math.round(overdue.reduce((n, x) => n + x.amount, 0) * 100) / 100,
      overdue: overdue.slice(0, 10),
    };
  }

  // ---------- Takvim ----------

  /** Açık satış siparişlerinin vade tarihi ve sevkiyatlar takvime tam gün öğesi olarak yansır. */
  private async calendarItems(u: AuthUser, from: Date, to: Date) {
    const items: any[] = [];
    if (scopeOf(u, 'order.read')) {
      const orders = await this.prisma.erpOrder.findMany({
        where: { ...(await this.scope.where(u, 'order.read')), kind: 'sales', status: { in: ['open', 'partial'] }, dueDate: { gte: from, lt: to } },
        orderBy: { dueDate: 'asc' }, take: 200,
      });
      const name = await this.names(orders.map((o) => o.customerCode));
      for (const o of orders) {
        const d = utcDay(o.dueDate!);
        items.push({ key: `order-${o.id}`, kind: 'order', id: o.id, title: `Sipariş vadesi ${o.docNo} · ${name(o.customerCode) ?? o.customerCode}`, start: d, end: d, allDay: true, color: '#a78bfa', link: `/orders?order=${o.id}` });
      }
    }
    if (scopeOf(u, 'shipment.read')) {
      const ships = await this.prisma.erpShipment.findMany({
        where: { ...(await this.scope.where(u, 'shipment.read')), date: { gte: from, lt: to } }, orderBy: { date: 'asc' }, take: 200,
      });
      const name = await this.names(ships.map((s) => s.customerCode));
      for (const s of ships) {
        const d = utcDay(s.date);
        items.push({ key: `shipment-${s.id}`, kind: 'shipment', id: s.id, title: `Sevk ${s.docNo} · ${name(s.customerCode) ?? s.customerCode}`, start: d, end: d, allDay: true, color: '#22d3ee', done: true, link: `/orders?tab=shipments&q=${encodeURIComponent(s.docNo)}` });
      }
    }
    return items;
  }
}
