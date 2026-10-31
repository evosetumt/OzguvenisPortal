import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { fmtDateTr as fmtDate, uniqIds } from '../common/format';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarService, CalendarItem } from '../calendar/calendar.service';
import type { AuthUser } from '../auth/auth.guard';
import { Scope, scopeOf, startOfTodayUtc } from '../common/scope';
import { addMonths, daysLeft, toDay } from '../tracking/tracking.service';
import { OPEN_STATUSES, PaymentDto, UpdatePaymentDto } from './payments.dto';

const DAY = 86400000;
const userSel = { select: { id: true, fullName: true } } as const;
const RECUR_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
export const TYPE_LABEL: Record<string, string> = {
  cheque: 'Çek', credit_card: 'Kredi kartı', loan: 'Kredi taksiti', tax: 'Vergi', sgk: 'SGK', rent: 'Kira', invoice: 'Fatura', other: 'Diğer',
};
const fmtMoney = (v: Prisma.Decimal | number, c: string) =>
  Number(v).toLocaleString('tr-TR', { style: 'currency', currency: /^[A-Z]{3}$/.test(c) ? c : 'TRY', maximumFractionDigits: 2 });

const include = {
  department: { select: { id: true, name: true, managerId: true, manager: userSel } },
  assignee: userSel,
  paidBy: userSel,
  createdBy: userSel,
  task: { select: { id: true, deletedAt: true, status: { select: { name: true, isDone: true } } } },
} satisfies Prisma.PaymentInclude;
type Row = Prisma.PaymentGetPayload<{ include: typeof include }>;

/**
 * Ödeme takibi. Kapsam payment.read'e göre:
 *  all: hepsi; department: kendi ve yöneticisi olduğu birimler; own: kendisine atanan veya oluşturduğu.
 * Birim yöneticisi kapsamdan bağımsız olarak yönettiği birimin ödemelerini her zaman görür ve görevlendirir.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
  ) {}

  onModuleInit() {
    this.notifications.registerRule('payment.awaiting_assignment', {
      label: 'Ödeme: görevlendirme bekliyor (birim yöneticisi)',
      defaultChannels: ['inapp', 'push', 'email'],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'payment.awaiting_assignment', title: `Ödeme görevi: ${p.title}`, body: `${p.amount} · vade ${p.due} · görevlendirme bekliyor`, link: `/payments?id=${p.paymentId}` },
      }),
    });
    this.notifications.registerRule('payment.paid', {
      label: 'Ödeme: ödendi',
      defaultChannels: ['inapp'],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'payment.paid', title: `Ödendi: ${p.title}`, body: p.amount, link: `/payments?id=${p.paymentId}` },
      }),
    });

    // Görev tamamlanınca ödeme "ödendi" olur; görev başkasına devredilince ödeme de o kişiye geçer.
    this.events.on('task.completed', async (e) => {
      const p = await this.prisma.payment.findFirst({ where: { taskId: e.payload.taskId, deletedAt: null, status: { in: OPEN_STATUSES } } });
      if (p) await this.markPaid(p.id, e.actorId);
    });
    this.events.on('task.assigned', async (e) => {
      const p = await this.prisma.payment.findFirst({ where: { taskId: e.payload.taskId, deletedAt: null, status: { in: OPEN_STATUSES } } });
      if (!p) return;
      // Sistemin yöneticiye otomatik açması (actorId null) "bekliyor"da kalır; kişinin elle devretmesi "görevlendirildi" yapar.
      await this.prisma.payment.update({
        where: { id: p.id },
        data: { assigneeId: e.payload.assigneeId, ...(e.actorId ? { status: 'assigned' } : {}) },
      });
    });

    this.calendar.registerSource((u, from, to) => this.calendarItems(u, from, to));
  }

  // ---------- Kapsam ----------

  /** Kullanıcının yöneticisi olduğu birimler */
  private async managedIds(u: AuthUser) {
    const rows = await this.prisma.department.findMany({ where: { managerId: u.id }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  private async scopeWhere(u: AuthUser): Promise<Prisma.PaymentWhereInput> {
    const scope = scopeOf(u, 'payment.read') as Scope | null;
    const managed = await this.managedIds(u);
    if (scope === 'all') return {};
    const or: Prisma.PaymentWhereInput[] = [];
    const depts = [...managed];
    if (scope === 'department' && u.departmentId) depts.push(u.departmentId);
    if (depts.length) or.push({ departmentId: { in: depts } });
    if (scope) or.push({ assigneeId: u.id }, { createdById: u.id });
    if (!or.length) throw new ForbiddenException();
    return { OR: or };
  }

  /** payment.manage kapsamı: all → her birim; department → kendi ve yönettiği birimler. */
  private async assertManage(u: AuthUser, departmentId: number) {
    const scope = scopeOf(u, 'payment.manage');
    if (scope === 'all') return;
    if (scope) {
      const ids = [...(await this.managedIds(u)), ...(u.departmentId ? [u.departmentId] : [])];
      if (ids.includes(departmentId)) return;
    }
    throw new ForbiddenException('Bu birim için ödeme kaydı yönetme yetkiniz yok');
  }

  private canAssign(u: AuthUser, p: { department: { managerId: number | null } }) {
    return scopeOf(u, 'payment.manage') === 'all' || p.department.managerId === u.id;
  }

  private async findVisible(u: AuthUser, id: number) {
    const p = await this.prisma.payment.findFirst({ where: { id, deletedAt: null, ...(await this.scopeWhere(u)) }, include });
    if (!p) throw new NotFoundException('Ödeme bulunamadı');
    return p;
  }

  private async decorate(u: AuthUser, rows: Row[]) {
    const today = startOfTodayUtc();
    const defLead = await this.defaultLeadDays();
    const manage = scopeOf(u, 'payment.manage');
    const myDepts = manage === 'department' ? [...(await this.managedIds(u)), ...(u.departmentId ? [u.departmentId] : [])] : [];
    return rows.map(({ task, ...p }) => {
      const lead = p.leadDays ?? defLead;
      const open = OPEN_STATUSES.includes(p.status);
      return {
        ...p,
        task: task && !task.deletedAt ? { id: task.id, status: task.status } : null,
        effectiveLeadDays: lead,
        taskDate: new Date(p.dueDate.getTime() - lead * DAY).toISOString(),
        daysLeft: daysLeft(p.dueDate, today),
        canAssign: open && this.canAssign(u, p),
        canEdit: manage === 'all' || (!!manage && myDepts.includes(p.departmentId)),
        canPay: open && (this.canAssign(u, p) || p.assigneeId === u.id || manage === 'all'),
      };
    });
  }

  defaultLeadDays() {
    return this.settings.get<number>('payment.defaultLeadDays', 7);
  }

  // ---------- Okuma ----------

  async list(u: AuthUser, f: { status?: string; type?: string; departmentId?: number; q?: string }) {
    const where: Prisma.PaymentWhereInput = { deletedAt: null, ...(await this.scopeWhere(u)) };
    if (f.status === 'open' || !f.status) where.status = { in: OPEN_STATUSES };
    else if (f.status !== 'all') where.status = f.status;
    if (f.type) where.type = f.type;
    if (f.departmentId) where.departmentId = f.departmentId;
    if (f.q) where.AND = [{ OR: [{ title: { contains: f.q } }, { counterparty: { contains: f.q } }, { docNo: { contains: f.q } }] }];
    const rows = await this.prisma.payment.findMany({
      where, include, take: 500,
      orderBy: f.status === 'paid' ? { paidAt: 'desc' } : { dueDate: 'asc' },
    });
    return this.decorate(u, rows);
  }

  async get(u: AuthUser, id: number) {
    return (await this.decorate(u, [await this.findVisible(u, id)]))[0];
  }

  /** Özet: atama bekleyen (yalnızca görevlendirebildiklerim), 7 ve 30 gün içindeki ödemeler, geciken; para birimine göre toplam. */
  async summary(u: AuthUser) {
    const base: Prisma.PaymentWhereInput = { deletedAt: null, status: { in: OPEN_STATUSES }, ...(await this.scopeWhere(u)) };
    const today = startOfTodayUtc();
    const rows = await this.prisma.payment.findMany({
      where: { ...base, dueDate: { lt: new Date(today.getTime() + 31 * DAY) } },
      select: { amount: true, currency: true, dueDate: true, status: true, department: { select: { managerId: true } } },
    });
    const all = scopeOf(u, 'payment.manage') === 'all';
    const sum: Record<string, number> = {};
    let in7 = 0, in30 = 0, overdue = 0, awaiting = 0;
    for (const r of rows) {
      const d = daysLeft(r.dueDate, today);
      if (d < 0) overdue++;
      else {
        in30++;
        if (d <= 7) in7++;
        sum[r.currency] = (sum[r.currency] ?? 0) + Number(r.amount);
      }
      if (r.status === 'awaiting' && (all || r.department.managerId === u.id)) awaiting++;
    }
    // 30 günden sonraki atama bekleyenler de sayılsın (uzun ön süreli kayıtlar)
    awaiting += await this.prisma.payment.count({
      where: { ...base, status: 'awaiting', dueDate: { gte: new Date(today.getTime() + 31 * DAY) }, ...(all ? {} : { department: { managerId: u.id } }) },
    });
    return { awaiting, in7, in30, overdue, totals30: Object.entries(sum).map(([currency, amount]) => ({ currency, amount })) };
  }

  // ---------- Yazma ----------

  private async checkDepartment(id: number) {
    const d = await this.prisma.department.findUnique({ where: { id } });
    if (!d) throw new BadRequestException('Birim bulunamadı');
  }

  async create(u: AuthUser, dto: PaymentDto) {
    await this.checkDepartment(dto.departmentId);
    await this.assertManage(u, dto.departmentId);
    const p = await this.prisma.payment.create({
      data: {
        type: dto.type, title: dto.title.trim(), counterparty: dto.counterparty || null, docNo: dto.docNo || null,
        amount: dto.amount, currency: dto.currency || 'TRY', dueDate: toDay(dto.dueDate), departmentId: dto.departmentId,
        leadDays: dto.leadDays ?? null, recurrence: dto.recurrence ?? 'none', notes: dto.notes || null, createdById: u.id,
      },
    });
    await this.audit.log(u.id, 'payment.create', 'payment', p.id, dto);
    await this.openDue(p.id); // vade zaten ön süre içindeyse görev hemen açılır
    return this.get(u, p.id);
  }

  async update(u: AuthUser, id: number, dto: UpdatePaymentDto) {
    const before = await this.findVisible(u, id);
    await this.assertManage(u, before.departmentId);
    if (dto.departmentId && dto.departmentId !== before.departmentId) {
      await this.checkDepartment(dto.departmentId);
      await this.assertManage(u, dto.departmentId);
    }
    if (!OPEN_STATUSES.includes(before.status)) throw new BadRequestException('Ödenmiş veya iptal edilmiş kayıt düzenlenemez');
    const data: Prisma.PaymentUncheckedUpdateInput = {
      type: dto.type, title: dto.title?.trim(), counterparty: dto.counterparty, docNo: dto.docNo, amount: dto.amount,
      currency: dto.currency, departmentId: dto.departmentId, leadDays: dto.leadDays, recurrence: dto.recurrence, notes: dto.notes,
      dueDate: dto.dueDate ? toDay(dto.dueDate) : undefined,
    };
    await this.prisma.payment.update({ where: { id }, data });
    await this.audit.log(u.id, 'payment.update', 'payment', id, dto);
    if (before.task && !before.task.deletedAt && (dto.dueDate || dto.title || dto.amount !== undefined)) {
      const p = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
      await this.prisma.task.update({ where: { id: before.task.id }, data: { title: this.taskTitle(p), dueDate: p.dueDate, description: this.taskBody(p) } });
    }
    await this.openDue(id);
    return this.get(u, id);
  }

  async cancel(u: AuthUser, id: number) {
    const p = await this.findVisible(u, id);
    await this.assertManage(u, p.departmentId);
    const r = await this.prisma.payment.updateMany({ where: { id, status: { in: OPEN_STATUSES } }, data: { status: 'cancelled' } });
    if (!r.count) throw new BadRequestException('Kayıt zaten kapanmış');
    // Açık görev iptal edilen ödeme için gereksizdir: silinir (soft delete).
    if (p.task && !p.task.deletedAt && !p.task.status.isDone) await this.prisma.task.update({ where: { id: p.task.id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'payment.cancel', 'payment', id);
    return this.get(u, id);
  }

  async remove(u: AuthUser, id: number) {
    const p = await this.findVisible(u, id);
    await this.assertManage(u, p.departmentId);
    if (p.task && !p.task.deletedAt && !p.task.status.isDone) await this.prisma.task.update({ where: { id: p.task.id }, data: { deletedAt: new Date() } });
    await this.prisma.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'payment.delete', 'payment', id);
  }

  /** Birim yöneticisi (veya payment.manage: all) ödemeyi bir kişiye görevlendirir; görev yoksa şimdi açılır. */
  async assign(u: AuthUser, id: number, assigneeId: number) {
    const p = await this.findVisible(u, id);
    if (!OPEN_STATUSES.includes(p.status)) throw new BadRequestException('Kapanmış ödeme görevlendirilemez');
    if (!this.canAssign(u, p)) throw new ForbiddenException('Yalnızca birim yöneticisi görevlendirebilir');
    const user = await this.prisma.user.findFirst({ where: { id: assigneeId, deletedAt: null, status: 'active' } });
    if (!user) throw new BadRequestException('Kullanıcı bulunamadı');
    await this.openTask(id, assigneeId, u.id);
    await this.audit.log(u.id, 'payment.assign', 'payment', id, { assigneeId });
    return this.get(u, id);
  }

  async pay(u: AuthUser, id: number) {
    const p = await this.findVisible(u, id);
    const [d] = await this.decorate(u, [p]);
    if (!d.canPay) throw new ForbiddenException('Bu ödemeyi kapatma yetkiniz yok');
    if (!(await this.markPaid(id, u.id))) throw new BadRequestException('Kayıt zaten kapanmış');
    await this.audit.log(u.id, 'payment.pay', 'payment', id);
    return this.get(u, id);
  }

  // ---------- Görev ----------

  private taskTitle(p: { type: string; title: string; amount: Prisma.Decimal | number; currency: string }) {
    return `Ödeme (${TYPE_LABEL[p.type] ?? p.type}): ${p.title} · ${fmtMoney(p.amount, p.currency)}`.slice(0, 250);
  }

  private taskBody(p: { counterparty: string | null; docNo: string | null; dueDate: Date; notes: string | null; id: number }) {
    return [
      `Vade: ${fmtDate(p.dueDate)}`,
      p.counterparty && `Banka / firma: ${p.counterparty}`,
      p.docNo && `Belge no: ${p.docNo}`,
      p.notes,
      '',
      'Görev tamamlandığında ödeme "ödendi" olarak işaretlenir.',
    ].filter((x): x is string => typeof x === 'string').join('\n');
  }

  /**
   * Ödemenin görevini açar veya var olanı yeni kişiye devreder.
   * assigneeId verilmezse (otomatik açılış) birim yöneticisine düşer ve "görevlendirme bekliyor" olur.
   */
  async openTask(id: number, assigneeId: number | null, actorId: number | null) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include });
    const managerId = p.department.manager ? p.department.managerId : null;
    const auto = assigneeId === null;
    const target = assigneeId ?? managerId;
    const status = auto ? 'awaiting' : 'assigned';

    if (p.task && !p.task.deletedAt && !p.task.status.isDone) {
      await this.prisma.payment.update({ where: { id }, data: { status, assigneeId: target } });
      if (target) {
        await this.prisma.task.update({ where: { id: p.task.id }, data: { assigneeId: target } });
        await this.prisma.taskWatcher.upsert({
          where: { taskId_userId: { taskId: p.task.id, userId: target } }, update: {}, create: { taskId: p.task.id, userId: target },
        });
        this.events.emit('task.assigned', actorId, { taskId: p.task.id, title: this.taskTitle(p), assigneeId: target });
      }
      return p.task.id;
    }

    const first = await this.prisma.taskStatus.findFirst({ where: { projectId: null, isDone: false }, orderBy: { sortOrder: 'asc' } });
    if (!first) throw new BadRequestException('Görev durumu tanımlı değil');
    const last = await this.prisma.task.aggregate({ where: { statusId: first.id }, _max: { sortOrder: true } });
    const watchers = uniqIds(target, managerId, p.createdById);
    const task = await this.prisma.task.create({
      data: {
        title: this.taskTitle(p), description: this.taskBody(p), priority: 'high', statusId: first.id,
        assigneeId: target, createdById: actorId ?? p.createdById, dueDate: p.dueDate,
        relatedType: 'payment', relatedId: String(p.id), sortOrder: (last._max.sortOrder ?? -1) + 1,
        watchers: { create: watchers.map((userId) => ({ userId })) },
      },
    });
    await this.prisma.payment.update({ where: { id }, data: { taskId: task.id, assigneeId: target, status, taskOpenedAt: new Date() } });
    this.events.emit('task.created', actorId, { taskId: task.id, title: task.title });
    if (target && !auto) this.events.emit('task.assigned', actorId, { taskId: task.id, title: task.title, assigneeId: target });

    if (auto) {
      // Yönetici yoksa ödeme yetkilileri (payment.manage: all) uyarılır.
      const userIds = managerId ? [managerId] : await this.globalManagers();
      this.events.emit('payment.awaiting_assignment', null, {
        paymentId: p.id, title: p.title, amount: fmtMoney(p.amount, p.currency), due: fmtDate(p.dueDate), userIds,
      });
    }
    return task.id;
  }

  private async globalManagers() {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', roles: { some: { role: { permissions: { some: { scope: 'all', permission: { code: 'payment.manage' } } } } } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Ön süresi gelmiş planlı ödemenin görevini açar (zamanlayıcı ve kayıt/düzenleme sonrası). */
  async openDue(id?: number) {
    const today = startOfTodayUtc();
    const def = await this.defaultLeadDays();
    const rows = await this.prisma.payment.findMany({
      where: { deletedAt: null, status: 'planned', ...(id ? { id } : {}), dueDate: { lte: new Date(today.getTime() + 90 * DAY) } },
      select: { id: true, dueDate: true, leadDays: true },
    });
    let n = 0;
    for (const r of rows) {
      if (daysLeft(r.dueDate, today) > (r.leadDays ?? def)) continue;
      // Koşullu geçiş: aynı anda iki çalıştırma aynı ödemeye iki görev açmasın.
      const ok = await this.prisma.payment.updateMany({ where: { id: r.id, status: 'planned' }, data: { status: 'awaiting' } });
      if (!ok.count) continue;
      try {
        await this.openTask(r.id, null, null);
        n++;
      } catch (e) {
        await this.prisma.payment.update({ where: { id: r.id }, data: { status: 'planned' } });
        console.error(`Ödeme #${r.id} için görev açılamadı`, e);
      }
    }
    return n;
  }

  /** Ödendi: görev kapanır, tekrarlıysa sonraki vade planlanır. Durum zaten kapalıysa false. */
  private async markPaid(id: number, actorId: number | null) {
    const ok = await this.prisma.payment.updateMany({
      where: { id, status: { in: OPEN_STATUSES } }, data: { status: 'paid', paidAt: new Date(), paidById: actorId },
    });
    if (!ok.count) return false;
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include });

    if (p.task && !p.task.deletedAt && !p.task.status.isDone) {
      const done = await this.prisma.taskStatus.findFirst({ where: { projectId: null, isDone: true }, orderBy: { sortOrder: 'asc' } });
      if (done) {
        await this.prisma.task.update({ where: { id: p.task.id }, data: { statusId: done.id, completedAt: new Date() } });
        this.events.emit('task.completed', actorId, { taskId: p.task.id, title: this.taskTitle(p), createdById: p.createdById });
      }
    }

    const months = RECUR_MONTHS[p.recurrence];
    if (months && !(await this.prisma.payment.count({ where: { previousId: p.id } }))) {
      const next = await this.prisma.payment.create({
        data: {
          type: p.type, title: p.title, counterparty: p.counterparty, docNo: p.docNo, amount: p.amount, currency: p.currency,
          dueDate: addMonths(p.dueDate, months), departmentId: p.departmentId, leadDays: p.leadDays, recurrence: p.recurrence,
          notes: p.notes, createdById: p.createdById, previousId: p.id,
        },
      });
      await this.openDue(next.id);
    }

    const userIds = uniqIds(p.department.managerId, p.createdById).filter((x) => x !== actorId);
    this.events.emit('payment.paid', actorId, { paymentId: p.id, title: p.title, amount: fmtMoney(p.amount, p.currency), userIds });
    return true;
  }

  // ---------- Takvim ----------

  private async calendarItems(u: AuthUser, from: Date, to: Date): Promise<CalendarItem[]> {
    let scope: Prisma.PaymentWhereInput;
    try { scope = await this.scopeWhere(u); } catch { return []; }
    const rows = await this.prisma.payment.findMany({
      where: { deletedAt: null, status: { not: 'cancelled' }, dueDate: { gte: from, lt: to }, ...scope },
      select: { id: true, title: true, type: true, amount: true, currency: true, dueDate: true, status: true, counterparty: true },
    });
    return rows.map((p) => ({
      key: `payment-${p.id}`, kind: 'payment', id: p.id,
      title: `${TYPE_LABEL[p.type] ?? 'Ödeme'}: ${p.title} · ${fmtMoney(p.amount, p.currency)}`,
      start: p.dueDate, end: new Date(p.dueDate.getTime() + DAY), allDay: true,
      color: '#e8833a', done: p.status === 'paid', description: p.counterparty, link: `/payments?id=${p.id}`,
    }));
  }
}
