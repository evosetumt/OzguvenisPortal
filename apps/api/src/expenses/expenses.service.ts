import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { ProcessEngine, HandlerContext } from '../workflow/process-engine.service';
import { JevService } from '../ai/jev.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf } from '../common/scope';
import { CategoryDto, ExpenseDto, ExpenseSettingsDto, UpdateCategoryDto, UpdateExpenseDto } from './expenses.dto';

export const EXPENSE_PROCESS_KEY = 'expense_approval';
const EDITABLE = ['draft', 'rejected'];

/** Karar adımı → onaylanınca/reddedilince masrafın yeni durumu. */
const STEP_STATUS: Record<string, Record<string, string>> = {
  manager: { approved: 'manager_approved', rejected: 'rejected' },
  accounting: { approved: 'accounting_approved', rejected: 'rejected' },
  payment: { paid: 'paid' },
};

/** Varsayılan kategoriler için Jev'e verilen açıklamalar; yeni eklenen kategoriler yalnızca adıyla değerlendirilir. */
const CATEGORY_HINTS: Record<string, string> = {
  'Yakıt': 'Araç yakıtı: benzin, motorin, LPG, akaryakıt istasyonu alımı',
  'Yemek': 'Çalışanın kendi yemek ve içecek giderleri (öğle yemeği, yol yemeği)',
  'Konaklama': 'Otel, pansiyon veya iş seyahatinde konaklama',
  'Ulaşım': 'Taksi, otobüs, uçak, tren, feribot bileti; otopark, köprü/otoyol geçişi, araç kiralama',
  'Kırtasiye': 'Kırtasiye ve ofis sarf malzemesi: kağıt, kalem, dosya, toner',
  'Temsil-Ağırlama': 'Müşteri, tedarikçi veya misafir ağırlama: iş yemeği, ikram, hediye',
  'Diğer': 'Yukarıdaki kategorilere uymayan diğer iş giderleri',
};
const NO_MATCH = 'Belirsiz';

const userSel = { select: { id: true, fullName: true, departmentId: true } } as const;
const listInclude = {
  user: userSel,
  category: { select: { id: true, name: true } },
  _count: { select: { receipts: true } },
} as const;

type Row = { amount: Prisma.Decimal; amountTry: Prisma.Decimal } & Record<string, unknown>;
const toNum = <T extends Row>(e: T) => ({ ...e, amount: Number(e.amount), amountTry: Number(e.amountTry) });

@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly attachments: AttachmentsService,
    private readonly engine: ProcessEngine,
    private readonly jev: JevService,
  ) {}

  onModuleInit() {
    this.engine.registerHandler('expense.autoApprove', {
      label: 'Masraf: otomatik onay',
      run: async (ctx) => {
        const e = await this.expenseOf(ctx);
        await this.prisma.$transaction([
          this.prisma.expenseApproval.create({ data: { expenseId: e.id, step: 'auto', decision: 'approved', comment: 'Eşik altı otomatik onay' } }),
          this.prisma.expense.update({ where: { id: e.id }, data: { status: 'manager_approved' } }),
        ]);
        this.events.emit('expense.approved', null, { expenseId: e.id, ownerId: e.userId, step: 'auto', amountTry: Number(e.amountTry) });
        return { autoApproved: true };
      },
    });
    this.engine.registerHandler('expense.recordDecision', {
      label: 'Masraf: kararı işle',
      argsHint: 'manager | accounting | payment',
      run: async (ctx) => {
        const step = ctx.args.trim();
        const decision = String(ctx.variables.decision ?? '');
        const status = STEP_STATUS[step]?.[decision];
        if (!status) throw new Error(`Geçersiz adım/karar: ${step}/${decision}`);
        const e = await this.expenseOf(ctx);
        const actorId = Number(ctx.variables.actorId) || null;
        const comment = (ctx.variables.comment as string | null) ?? null;
        await this.prisma.$transaction([
          this.prisma.expenseApproval.create({ data: { expenseId: e.id, step, decision, comment, approverId: actorId } }),
          this.prisma.expense.update({ where: { id: e.id }, data: { status } }),
        ]);
        const p = { expenseId: e.id, ownerId: e.userId, step, comment, amountTry: Number(e.amountTry) };
        this.events.emit(decision === 'paid' ? 'expense.paid' : decision === 'approved' ? 'expense.approved' : 'expense.rejected', actorId, p);
      },
    });
    this.engine.registerHandler('expense.setStatus', {
      label: 'Masraf: durum ata',
      argsHint: 'submitted | manager_approved | accounting_approved | rejected | paid',
      run: async (ctx) => {
        const status = ctx.args.trim();
        if (!['submitted', 'manager_approved', 'accounting_approved', 'rejected', 'paid'].includes(status)) throw new Error(`Geçersiz durum: ${status}`);
        const e = await this.expenseOf(ctx);
        await this.prisma.expense.update({ where: { id: e.id }, data: { status } });
      },
    });

    const link = (id: number) => `/expenses?id=${id}`;
    const stepText: Record<string, string> = { auto: 'otomatik', manager: 'yöneticiniz tarafından', accounting: 'muhasebe tarafından' };
    this.notifications.registerRule('expense.approved', {
      label: 'Masraf onaylandı',
      rule: ({ payload: p }) => ({
        userIds: [p.ownerId],
        n: { type: 'expense.approved', title: `Masrafınız ${stepText[p.step] ?? ''} onaylandı`, body: `Masraf #${p.expenseId} · ${fmtTry(p.amountTry)}`, link: link(p.expenseId) },
      }),
    });
    this.notifications.registerRule('expense.rejected', {
      label: 'Masraf reddedildi',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: [p.ownerId],
        n: { type: 'expense.rejected', title: 'Masrafınız reddedildi', body: `Masraf #${p.expenseId}${p.comment ? ` · ${p.comment}` : ''}`, link: link(p.expenseId) },
      }),
    });
    this.notifications.registerRule('expense.paid', {
      label: 'Masraf ödendi',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: [p.ownerId],
        n: { type: 'expense.paid', title: 'Masrafınız ödendi', body: `Masraf #${p.expenseId} · ${fmtTry(p.amountTry)}`, link: link(p.expenseId) },
      }),
    });

    // Fiş dosyası: masrafı görebilen herkes açabilir.
    this.attachments.registerAccessCheck(async (u, attachmentId) => {
      const receipts = await this.prisma.expenseReceipt.findMany({
        where: { attachmentId },
        select: { expense: { select: { id: true, userId: true, processInstanceId: true, status: true, user: { select: { departmentId: true } } } } },
      });
      for (const r of receipts) if (await this.canView(u, r.expense)) return true;
      return false;
    });
  }

  private async expenseOf(ctx: HandlerContext) {
    if (ctx.instance.entityType !== 'expense' || !ctx.instance.entityId) throw new Error('Süreç bir masrafa bağlı değil');
    return this.prisma.expense.findUniqueOrThrow({ where: { id: Number(ctx.instance.entityId) } });
  }

  // ---------- Yetki ----------

  /** Kullanıcının yönettiği departmanlar + kendi departmanı (department kapsamı için). */
  private async deptIds(u: AuthUser) {
    const managed = await this.prisma.department.findMany({ where: { managerId: u.id }, select: { id: true } });
    return [...new Set([u.departmentId, ...managed.map((d) => d.id)].filter((x): x is number => !!x))];
  }

  private async canView(u: AuthUser, e: { userId: number; status: string; processInstanceId: number | null; user: { departmentId: number | null } }) {
    if (e.userId === u.id) return true;
    if (e.status === 'draft') return false;
    const acc = scopeOf(u, 'expense.accounting');
    const appr = scopeOf(u, 'expense.approve');
    if (acc === 'all' || appr === 'all') return true;
    if ((acc === 'department' || appr === 'department') && e.user.departmentId && (await this.deptIds(u)).includes(e.user.departmentId)) return true;
    if (e.processInstanceId) {
      const n = await this.prisma.processTask.count({ where: { instanceId: e.processInstanceId, ...(await this.engine.taskAccessWhere(u.id)) } });
      if (n) return true;
    }
    return false;
  }

  // ---------- Kategoriler ----------

  categories(all: boolean) {
    return this.prisma.expenseCategory.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createCategory(u: AuthUser, dto: CategoryDto) {
    if (await this.prisma.expenseCategory.findUnique({ where: { name: dto.name.trim() } })) throw new ConflictException('Bu kategori zaten var');
    const c = await this.prisma.expenseCategory.create({ data: { ...dto, name: dto.name.trim() } });
    await this.audit.log(u.id, 'expense_category.create', 'expense_category', c.id, dto);
    return c;
  }

  async updateCategory(u: AuthUser, id: number, dto: UpdateCategoryDto) {
    const c = await this.prisma.expenseCategory.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } }).catch(() => null);
    if (!c) throw new NotFoundException('Kategori bulunamadı');
    await this.audit.log(u.id, 'expense_category.update', 'expense_category', id, dto);
    return c;
  }

  // ---------- Masraflar ----------

  async list(u: AuthUser, view: string, status?: string) {
    let where: Prisma.ExpenseWhereInput;
    if (view === 'team') {
      const appr = scopeOf(u, 'expense.approve');
      if (!appr) throw new ForbiddenException();
      where = { status: { not: 'draft' }, ...(appr === 'all' ? {} : { user: { departmentId: { in: await this.deptIds(u) } }, userId: { not: u.id } }) };
    } else if (view === 'all') {
      if (scopeOf(u, 'expense.accounting') !== 'all' && scopeOf(u, 'expense.approve') !== 'all') throw new ForbiddenException();
      where = { status: { not: 'draft' } };
    } else {
      where = { userId: u.id };
    }
    const rows = await this.prisma.expense.findMany({
      where: { deletedAt: null, ...where, ...(status ? { status } : {}) },
      include: listInclude,
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map(toNum);
  }

  async get(u: AuthUser, id: number) {
    const e = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...listInclude,
        receipts: { include: { attachment: { select: { id: true, fileName: true, mime: true, size: true } } } },
        approvals: { include: { approver: { select: { id: true, fullName: true } } }, orderBy: { id: 'asc' } },
      },
    });
    if (!e || !(await this.canView(u, e))) throw new NotFoundException('Masraf bulunamadı');
    const openTasks = e.processInstanceId
      ? await this.prisma.processTask.findMany({
        where: { instanceId: e.processInstanceId, status: 'open' },
        select: { id: true, name: true, dueAt: true, candidateRole: true, candidateDeptId: true, assignee: { select: { id: true, fullName: true } } },
      })
      : [];
    const { receipts, ...rest } = e;
    return { ...toNum(rest), receipts: receipts.map((r) => r.attachment), openTasks: await this.engine.candidateLabels(openTasks), canEdit: e.userId === u.id && EDITABLE.includes(e.status) };
  }

  private async checkReceipts(u: AuthUser, ids: number[]) {
    if (!ids.length) return;
    const n = await this.prisma.attachment.count({ where: { id: { in: ids }, uploadedById: u.id } });
    if (n !== new Set(ids).size) throw new BadRequestException('Fiş dosyası bulunamadı');
  }

  private async checkCategory(id: number) {
    const c = await this.prisma.expenseCategory.findFirst({ where: { id, isActive: true } });
    if (!c) throw new BadRequestException('Geçersiz kategori');
  }

  private amountTry(currency: string, amount: number, amountTry?: number) {
    if (currency === 'TRY') return amount;
    if (!amountTry) throw new BadRequestException('Döviz masraflarında TL karşılığını girin');
    return amountTry;
  }

  async create(u: AuthUser, dto: ExpenseDto) {
    await this.checkCategory(dto.categoryId);
    const receiptIds = [...new Set(dto.receiptIds ?? [])];
    await this.checkReceipts(u, receiptIds);
    const currency = dto.currency ?? 'TRY';
    const e = await this.prisma.expense.create({
      data: {
        userId: u.id,
        categoryId: dto.categoryId,
        amount: dto.amount,
        currency,
        amountTry: this.amountTry(currency, dto.amount, dto.amountTry),
        expenseDate: new Date(dto.expenseDate),
        description: dto.description.trim(),
        receipts: { create: receiptIds.map((attachmentId) => ({ attachmentId })) },
      },
    });
    await this.audit.log(u.id, 'expense.create', 'expense', e.id, dto);
    return this.get(u, e.id);
  }

  private async own(u: AuthUser, id: number) {
    const e = await this.prisma.expense.findFirst({ where: { id, deletedAt: null, userId: u.id } });
    if (!e) throw new NotFoundException('Masraf bulunamadı');
    if (!EDITABLE.includes(e.status)) throw new ConflictException('Onaya gönderilmiş masraf değiştirilemez');
    return e;
  }

  async update(u: AuthUser, id: number, dto: UpdateExpenseDto) {
    const e = await this.own(u, id);
    if (dto.categoryId) await this.checkCategory(dto.categoryId);
    if (dto.receiptIds) await this.checkReceipts(u, [...new Set(dto.receiptIds)]);
    const currency = dto.currency ?? e.currency;
    const amount = dto.amount ?? Number(e.amount);
    const amountTry = currency === 'TRY' ? amount : dto.amountTry ?? (currency === e.currency ? Number(e.amountTry) : undefined);
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          amount,
          currency,
          amountTry: this.amountTry(currency, amount, amountTry),
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
          description: dto.description?.trim(),
        },
      });
      if (dto.receiptIds) {
        const ids = [...new Set(dto.receiptIds)];
        await tx.expenseReceipt.deleteMany({ where: { expenseId: id, attachmentId: { notIn: ids } } });
        const have = new Set((await tx.expenseReceipt.findMany({ where: { expenseId: id } })).map((r) => r.attachmentId));
        const add = ids.filter((x) => !have.has(x));
        if (add.length) await tx.expenseReceipt.createMany({ data: add.map((attachmentId) => ({ expenseId: id, attachmentId })) });
      }
    });
    await this.audit.log(u.id, 'expense.update', 'expense', id, dto);
    return this.get(u, id);
  }

  async remove(u: AuthUser, id: number) {
    const e = await this.own(u, id);
    if (e.status !== 'draft') throw new ConflictException('Yalnızca taslak masraf silinebilir');
    await this.prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'expense.delete', 'expense', id);
  }

  /** Masrafı onaya gönderir: etkin "expense_approval" süreci başlar. Süreç hata verirse masraf eski durumuna döner. */
  async submit(u: AuthUser, id: number) {
    const e = await this.own(u, id);
    const receipts = await this.prisma.expenseReceipt.count({ where: { expenseId: id } });
    if (!receipts) throw new BadRequestException('Onaya göndermek için fiş fotoğrafı veya belgesi ekleyin');
    const claimed = await this.prisma.expense.updateMany({
      where: { id, status: e.status },
      data: { status: 'submitted', submittedAt: new Date() },
    });
    if (!claimed.count) throw new ConflictException('Masraf zaten gönderilmiş');

    const full = await this.prisma.expense.findUniqueOrThrow({ where: { id }, include: { category: true, user: { select: { fullName: true } } } });
    let inst;
    try {
      inst = await this.engine.start(EXPENSE_PROCESS_KEY, {
        entityType: 'expense',
        entityId: id,
        businessKey: `Masraf #${id} · ${full.user.fullName} · ${fmtTry(Number(full.amountTry))}`,
        startedById: u.id,
        variables: {
          expenseId: id, ownerId: u.id, amount: Number(full.amount), currency: full.currency,
          amountTry: Number(full.amountTry), category: full.category.name,
        },
      });
    } catch (err) {
      await this.prisma.expense.update({ where: { id }, data: { status: e.status, submittedAt: e.submittedAt } });
      throw err;
    }
    if (inst.status === 'failed') {
      await this.prisma.expense.update({ where: { id }, data: { status: e.status, submittedAt: e.submittedAt, processInstanceId: null } });
      throw new BadRequestException(`Onay süreci başlatılamadı: ${inst.error ?? 'bilinmeyen hata'}`);
    }
    await this.prisma.expense.update({ where: { id }, data: { processInstanceId: inst.id } });
    await this.audit.log(u.id, 'expense.submit', 'expense', id, { processInstanceId: inst.id });
    this.events.emit('expense.submitted', u.id, { expenseId: id, ownerId: u.id, amountTry: Number(full.amountTry), processInstanceId: inst.id });
    return this.get(u, id);
  }

  // ---------- Ayarlar ----------

  async getSettings() {
    return {
      autoApproveLimit: Number(await this.settings.get<number>('expense.autoApproveLimit', 50)),
      approvalReminderHours: Number(await this.settings.get<number>('workflow.approvalReminderHours', 48)),
      aiCategorySuggest: (await this.settings.get<boolean>('ai.expenseCategorySuggest', false)) === true,
      aiAvailable: this.jev.isConfigured(),
    };
  }

  async saveSettings(u: AuthUser, dto: ExpenseSettingsDto) {
    if (dto.autoApproveLimit !== undefined) await this.settings.set('expense.autoApproveLimit', dto.autoApproveLimit);
    if (dto.approvalReminderHours !== undefined) await this.settings.set('workflow.approvalReminderHours', dto.approvalReminderHours);
    if (dto.aiCategorySuggest !== undefined) await this.settings.set('ai.expenseCategorySuggest', dto.aiCategorySuggest);
    await this.audit.log(u.id, 'expense.settings', 'setting', 'expense', dto);
    return this.getSettings();
  }

  // ---------- Jev kategori önerisi ----------

  /**
   * Masraf açıklamasından kategori önerir (TypeSafe Jev, Choice). Ayarla açılmadıkça çalışmaz: açıklama şirket dışına gider.
   * Güven eşiğinin altında veya "Belirsiz" ise öneri yapılmaz; hata/zaman aşımı sessizce "öneri yok" döner.
   */
  async suggestCategory(description: string, amount?: number) {
    const enabled = (await this.settings.get<boolean>('ai.expenseCategorySuggest', false)) === true && this.jev.isConfigured();
    if (!enabled) return { enabled: false };
    const cats = await this.categories(false);
    if (!cats.length) return { enabled: true, categoryId: null };
    const criteria: Record<string, string> = {};
    for (const c of cats) criteria[c.name] = CATEGORY_HINTS[c.name] ?? c.name;
    criteria[NO_MATCH] = 'Açıklama hangi kategori olduğunu anlamaya yetmiyor';
    const started = Date.now();
    const a = await this.jev.choice(
      { expense: { description: description.trim(), ...(amount ? { amountTry: amount } : {}) } },
      'Which company expense category best fits the expense described in `expense.description` (Turkish text)?',
      criteria,
    );
    const ms = Date.now() - started;
    if (!a) return { enabled: true, categoryId: null, ms };
    const min = Number(await this.settings.get<number>('ai.expenseCategoryMinConfidence', 0.6));
    const cat = cats.find((c) => c.name === a.choice);
    const ok = !!cat && a.confidence >= min;
    return {
      enabled: true,
      categoryId: ok ? cat!.id : null,
      categoryName: ok ? cat!.name : null,
      confidence: Math.round(a.confidence * 100) / 100,
      ms,
    };
  }
}

const fmtTry = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
