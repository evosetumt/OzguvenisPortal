import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/auth.guard';
import { BpmnElement, BpmnModel, parseBpmn } from './bpmn-model';
import { collectVars, evaluate, parseExpression } from './expression';

export interface HandlerContext {
  instance: { id: number; entityType: string | null; entityId: string | null; businessKey: string | null; startedById: number | null };
  elementId: string;
  args: string;
  variables: Record<string, unknown>;
}

/** Servis görevi işleyicisi. Döndürdüğü nesne süreç değişkenlerine eklenir. */
export interface ServiceHandler {
  label: string;
  argsHint?: string;
  run(ctx: HandlerContext): Promise<Record<string, unknown> | void>;
}

export const DEFAULT_DECISIONS = ['approved', 'rejected'];
const MAX_STEPS = 200;
const HOUR = 3600_000;

export const decisionsOf = (el?: BpmnElement) =>
  (el?.attrs.decisions ? el.attrs.decisions.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_DECISIONS);

/**
 * Hafif BPMN yorumlayıcısı. Süreç durumu veritabanında tutulur (process_instances / process_tasks / process_events);
 * sunucu yeniden başlasa da kullanıcı görevleri kaldığı yerden devam eder.
 * Paralel akış desteklenmez: her örnekte tek bir etkin nokta (token) vardır.
 */
@Injectable()
export class ProcessEngine implements OnModuleInit {
  private readonly handlers = new Map<string, ServiceHandler>();
  private readonly models = new Map<number, BpmnModel>(); // definitionId → ayrıştırılmış model (tanımlar değişmez; yeni sürüm yeni id)

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.registerHandler('notify', {
      label: 'Bildirim gönder',
      argsHint: 'alıcı|başlık — alıcı: initiator, role:<Rol> veya user:<id>',
      run: async (ctx) => {
        const [target, ...rest] = ctx.args.split('|');
        const title = rest.join('|').trim() || 'Süreç bildirimi';
        const ids = await this.resolveRecipients(target.trim(), ctx.instance.startedById);
        await this.notifications.send(ids, { type: 'process.notify', title, body: ctx.instance.businessKey ?? undefined, link: '/approvals' }, 'process.notify');
      },
    });
    this.registerHandler('setVariable', {
      label: 'Değişken ata',
      argsHint: 'ad=değer',
      run: async (ctx) => {
        const i = ctx.args.indexOf('=');
        if (i < 1) throw new Error('setVariable argümanı "ad=değer" olmalı');
        return { [ctx.args.slice(0, i).trim()]: ctx.args.slice(i + 1).trim() };
      },
    });

    this.notifications.registerRule('process.task_assigned', {
      label: 'Onay görevi atandı',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'process.task_assigned', title: `Onayınız bekleniyor: ${p.taskName}`, body: p.businessKey ?? p.processName, link: `/approvals?task=${p.taskId}` },
      }),
    });
    this.notifications.registerRule('process.task_overdue', {
      label: 'Onay görevi gecikti',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: p.recipientIds,
        n: { type: 'process.task_overdue', title: `Bekleyen onay: ${p.taskName}`, body: p.businessKey ?? p.processName, link: `/approvals?task=${p.taskId}` },
      }),
    });
    this.notifications.registerRule('process.notify', {
      label: 'Süreç bildirimi (akıştan)',
      rule: () => null, // gönderim notify işleyicisinde doğrudan yapılır; kural yalnızca kanal ayarı için
    });

    const timer = setInterval(() => void this.remindOverdue(), HOUR);
    timer.unref();
    setTimeout(() => void this.remindOverdue(), 20_000).unref();
    setTimeout(() => void this.backfillMirrors().catch((e) => console.error('Onay görevleri yansıtılamadı', e)), 5_000).unref();
  }

  registerHandler(name: string, h: ServiceHandler) {
    this.handlers.set(name, h);
  }

  handlerNames() {
    return new Set(this.handlers.keys());
  }

  handlerList() {
    return [...this.handlers.entries()].map(([name, h]) => ({ name, label: h.label, argsHint: h.argsHint ?? '' }));
  }

  async model(definitionId: number) {
    let m = this.models.get(definitionId);
    if (!m) {
      const d = await this.prisma.processDefinition.findUniqueOrThrow({ where: { id: definitionId }, select: { bpmnXml: true } });
      m = parseBpmn(d.bpmnXml);
      this.models.set(definitionId, m);
    }
    return m;
  }

  /** Tanımın etkin sürümüyle yeni bir süreç başlatır ve ilk bekleme noktasına (kullanıcı görevi/bitiş) kadar ilerletir. */
  async start(key: string, opts: { entityType?: string; entityId?: string | number; businessKey?: string; startedById: number; variables?: Record<string, unknown> }) {
    const def = await this.prisma.processDefinition.findFirst({ where: { key, status: 'active' }, orderBy: { version: 'desc' } });
    if (!def) throw new BadRequestException(`"${key}" için etkin bir süreç tanımı yok`);
    const model = await this.model(def.id);
    if (!model.startId) throw new BadRequestException('Süreç tanımında başlangıç olayı yok');
    const variables = { ...(opts.variables ?? {}), initiatorId: opts.startedById };
    const inst = await this.prisma.processInstance.create({
      data: {
        definitionId: def.id,
        entityType: opts.entityType,
        entityId: opts.entityId === undefined ? undefined : String(opts.entityId),
        businessKey: opts.businessKey,
        startedById: opts.startedById,
        variables: JSON.stringify(variables),
      },
    });
    await this.log(inst.id, null, 'started', { key, version: def.version });
    await this.run(inst.id, model.startId, variables);
    return this.prisma.processInstance.findUniqueOrThrow({ where: { id: inst.id } });
  }

  /** Kullanıcının görebileceği/üstlenebileceği görev filtresi (atanmış veya rolüne açık). */
  async taskAccessWhere(userId: number) {
    const roles = await this.roleNames(userId);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
    return {
      OR: [
        { assigneeId: userId },
        ...(roles.length ? [{ candidateRole: { in: roles } }] : []),
        ...(me?.departmentId ? [{ candidateDeptId: me.departmentId }] : []),
      ],
    };
  }

  async roleNames(userId: number) {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { role: { select: { name: true } } } });
    return rows.map((r) => r.role.name);
  }

  async completeTask(u: AuthUser, taskId: number, decision: string, comment?: string) {
    const task = await this.prisma.processTask.findFirst({
      where: { id: taskId, ...(await this.taskAccessWhere(u.id)) },
      include: { instance: true },
    });
    if (!task) throw new NotFoundException('Görev bulunamadı');
    if (task.status !== 'open') throw new ConflictException('Bu görev zaten tamamlanmış');
    const model = await this.model(task.instance.definitionId);
    const el = model.elements.get(task.elementId);
    if (!el) throw new BadRequestException('Görev süreç tanımında bulunamadı');
    const allowed = decisionsOf(el);
    if (!allowed.includes(decision)) throw new BadRequestException(`Geçersiz karar. Seçenekler: ${allowed.join(', ')}`);
    const note = comment?.trim() || undefined;
    if (decision === 'rejected' && !note) throw new BadRequestException('Red için açıklama yazın');

    // Aynı görevin iki kez tamamlanmasını engelle (eşzamanlı tıklama).
    const done = await this.prisma.processTask.updateMany({
      where: { id: taskId, status: 'open' },
      data: { status: 'completed', completedById: u.id, completedAt: new Date(), formData: JSON.stringify({ decision, comment: note }) },
    });
    if (!done.count) throw new ConflictException('Bu görev zaten tamamlanmış');

    const vars = this.parseVars(task.instance.variables);
    Object.assign(vars, { decision, comment: note ?? null, actorId: u.id, [`${task.elementId}_decision`]: decision });
    await this.log(task.instanceId, task.elementId, 'task_completed', { taskId, decision, comment: note, userId: u.id });
    await this.closeMirror(task.taskId, u.id, 'done');
    await this.log(task.instanceId, task.elementId, 'completed');
    this.events.emit('process.task_completed', u.id, {
      taskId, instanceId: task.instanceId, elementId: task.elementId, decision, comment: note,
      entityType: task.instance.entityType, entityId: task.instance.entityId,
    });
    if (task.instance.status === 'running') {
      const next = this.target(model, el.outgoing[0]);
      await this.run(task.instanceId, next, vars);
    }
    return { ok: true };
  }

  /** Süreci iptal eder (açık görevler kapanır). */
  async cancel(instanceId: number, reason: string) {
    const open = await this.prisma.processTask.findMany({ where: { instanceId, status: 'open' }, select: { taskId: true } });
    for (const t of open) await this.closeMirror(t.taskId, null, 'removed');
    await this.prisma.processTask.updateMany({ where: { instanceId, status: 'open' }, data: { status: 'cancelled' } });
    await this.prisma.processInstance.update({ where: { id: instanceId }, data: { status: 'cancelled', endedAt: new Date() } });
    await this.log(instanceId, null, 'cancelled', { reason });
  }

  private target(model: BpmnModel, flowId?: string) {
    const f = flowId ? model.flows.get(flowId) : undefined;
    if (!f) throw new Error('Çıkan akış bulunamadı');
    return f.target;
  }

  private parseVars(s: string): Record<string, unknown> {
    try { return JSON.parse(s) ?? {}; } catch { return {}; }
  }

  private async saveVars(instanceId: number, vars: Record<string, unknown>) {
    await this.prisma.processInstance.update({ where: { id: instanceId }, data: { variables: JSON.stringify(vars) } });
  }

  private async log(instanceId: number, elementId: string | null, type: string, payload?: unknown) {
    await this.prisma.processEvent.create({
      data: { instanceId, elementId, type, payload: payload === undefined ? null : JSON.stringify(payload) },
    });
  }

  /** elementId'ye girip bir bekleme noktasına veya bitişe kadar ilerler. Hata olursa örnek "failed" olur. */
  private async run(instanceId: number, elementId: string, vars: Record<string, unknown>) {
    const inst = await this.prisma.processInstance.findUniqueOrThrow({ where: { id: instanceId }, include: { definition: { select: { name: true } } } });
    const model = await this.model(inst.definitionId);
    let cur = elementId;
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const el = model.elements.get(cur);
        if (!el) throw new Error(`Öğe bulunamadı: ${cur}`);
        await this.log(instanceId, el.id, 'entered');
        switch (el.type) {
          case 'startEvent':
            await this.log(instanceId, el.id, 'completed');
            cur = this.target(model, el.outgoing[0]);
            break;
          case 'serviceTask': {
            const h = this.handlers.get(el.attrs.handler ?? '');
            if (!h) throw new Error(`İşleyici kayıtlı değil: ${el.attrs.handler}`);
            const out = await h.run({
              instance: { id: inst.id, entityType: inst.entityType, entityId: inst.entityId, businessKey: inst.businessKey, startedById: inst.startedById },
              elementId: el.id,
              args: el.attrs.args ?? '',
              variables: vars,
            });
            if (out) Object.assign(vars, out);
            await this.saveVars(instanceId, vars);
            await this.log(instanceId, el.id, 'completed', out ?? undefined);
            cur = this.target(model, el.outgoing[0]);
            break;
          }
          case 'exclusiveGateway': {
            const flowId = await this.chooseFlow(model, el, vars);
            await this.log(instanceId, el.id, 'completed', { flow: flowId });
            cur = this.target(model, flowId);
            break;
          }
          case 'userTask':
            await this.createUserTask(inst, el, vars);
            await this.saveVars(instanceId, vars);
            return;
          case 'endEvent':
            await this.log(instanceId, el.id, 'completed');
            await this.prisma.processInstance.update({ where: { id: instanceId }, data: { status: 'completed', endedAt: new Date(), variables: JSON.stringify(vars) } });
            await this.log(instanceId, null, 'ended', { endId: el.id });
            return;
        }
      }
      throw new Error('Adım sınırı aşıldı (döngü olabilir)');
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error(`Süreç #${instanceId} hata`, e);
      await this.prisma.processInstance.update({ where: { id: instanceId }, data: { status: 'failed', error: msg.slice(0, 2000), variables: JSON.stringify(vars) } });
      await this.log(instanceId, cur, 'error', { message: msg });
    }
  }

  private async chooseFlow(model: BpmnModel, el: BpmnElement, vars: Record<string, unknown>) {
    if (el.outgoing.length === 1 && !model.flows.get(el.outgoing[0])?.condition) return el.outgoing[0];
    const ctx: Record<string, unknown> = { ...vars };
    for (const fid of el.outgoing) {
      const f = model.flows.get(fid)!;
      if (fid === el.defaultFlow || !f.condition) continue;
      const ast = parseExpression(f.condition);
      for (const v of collectVars(ast)) {
        if (v.startsWith('settings.') && !(v in ctx)) ctx[v] = await this.settings.get<unknown>(v.slice('settings.'.length), undefined);
      }
      if (evaluate(ast, ctx)) return fid;
    }
    if (el.defaultFlow) return el.defaultFlow;
    throw new Error(`${el.name || el.id}: hiçbir koşul sağlanmadı ve varsayılan akış yok`);
  }

  /**
   * portal:assignee → atanan kişi, aday departman veya aday rol.
   * "manager" = başlatanın departman yöneticisi (yoksa üst departmanınki, o da yoksa Admin rolü).
   * "department:<Ad>" = o birimdeki herkes (ad tam eşleşir ya da "<Ad> (…)" biçimindedir); birim yok veya boşsa aynı adlı rol, o da yoksa Admin.
   */
  private async resolveAssignee(spec: string, startedById: number | null): Promise<{ assigneeId?: number; candidateRole?: string; candidateDeptId?: number }> {
    if (spec === 'initiator' && startedById) return { assigneeId: startedById };
    if (spec.startsWith('user:')) return { assigneeId: Number(spec.slice(5)) };
    if (spec.startsWith('role:')) return { candidateRole: spec.slice(5).trim() };
    if (spec.startsWith('department:')) {
      const name = spec.slice(11).trim();
      const depts = await this.prisma.department.findMany({ where: { OR: [{ name }, { name: { startsWith: `${name} (` } }] }, select: { id: true, name: true } });
      const dept = depts.find((d) => d.name === name) ?? depts[0];
      if (dept && (await this.prisma.user.count({ where: { departmentId: dept.id, deletedAt: null, status: 'active' } }))) return { candidateDeptId: dept.id };
      if (await this.prisma.role.count({ where: { name } })) return { candidateRole: name };
      return { candidateRole: 'Admin' };
    }
    if (spec === 'manager' && startedById) {
      const user = await this.prisma.user.findUnique({ where: { id: startedById }, select: { departmentId: true } });
      let deptId = user?.departmentId ?? null;
      for (let depth = 0; deptId && depth < 10; depth++) {
        const d = await this.prisma.department.findUnique({ where: { id: deptId }, select: { managerId: true, parentId: true } });
        if (d?.managerId && d.managerId !== startedById) return { assigneeId: d.managerId };
        deptId = d?.parentId ?? null;
      }
    }
    return { candidateRole: 'Admin' };
  }

  private async resolveRecipients(spec: string, startedById: number | null): Promise<number[]> {
    return this.candidates(await this.resolveAssignee(spec, startedById));
  }

  /** Ekranlarda sorumlu etiketi: kişi adı, "<Birim> birimi" veya "<Rol> rolü". */
  async candidateLabels<T extends { assignee?: { fullName: string } | null; candidateRole: string | null; candidateDeptId: number | null }>(tasks: T[]) {
    const ids = [...new Set(tasks.map((t) => t.candidateDeptId).filter((x): x is number => !!x))];
    const depts = new Map((ids.length ? await this.prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((d) => [d.id, d.name]));
    return tasks.map((t) => ({
      ...t,
      candidateLabel: t.assignee?.fullName ?? (t.candidateDeptId ? `${depts.get(t.candidateDeptId) ?? 'Birim'} birimi` : t.candidateRole ? `${t.candidateRole} rolü` : null),
    }));
  }

  /** Görevi görebilen/üstlenebilen kişiler: atanan kişi, birim üyeleri veya rol üyeleri. */
  private async candidates(who: { assigneeId?: number | null; candidateRole?: string | null; candidateDeptId?: number | null }) {
    if (who.assigneeId) return [who.assigneeId];
    if (who.candidateDeptId) {
      const users = await this.prisma.user.findMany({ where: { departmentId: who.candidateDeptId, deletedAt: null, status: 'active' }, select: { id: true } });
      return users.map((u) => u.id);
    }
    return this.roleMembers(who.candidateRole ?? 'Admin');
  }

  private async roleMembers(role: string) {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', roles: { some: { role: { name: role } } } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async createUserTask(
    inst: { id: number; startedById: number | null; businessKey: string | null; definition: { name: string } },
    el: BpmnElement,
    vars: Record<string, unknown>,
  ) {
    const who = await this.resolveAssignee(el.attrs.assignee ?? 'manager', inst.startedById);
    const hours = Number(el.attrs.dueHours) || (await this.settings.get<number>('workflow.approvalReminderHours', 48));
    const task = await this.prisma.processTask.create({
      data: {
        instanceId: inst.id,
        elementId: el.id,
        name: el.name || el.id,
        assigneeId: who.assigneeId,
        candidateRole: who.candidateRole,
        candidateDeptId: who.candidateDeptId,
        dueAt: new Date(Date.now() + hours * HOUR),
      },
    });
    await this.log(inst.id, el.id, 'task_created', { taskId: task.id, ...who });
    const recipientIds = await this.candidates(who);
    await this.mirror(task.id, recipientIds);
    this.events.emit('process.task_assigned', null, {
      taskId: task.id, taskName: task.name, instanceId: inst.id, processName: inst.definition.name,
      businessKey: inst.businessKey, recipientIds, variables: vars,
    });
  }

  /** Süresi geçen açık görevler için sorumlulara bir kez hatırlatma gönderir. */
  async remindOverdue() {
    try {
      const tasks = await this.prisma.processTask.findMany({
        where: { status: 'open', reminderSentAt: null, dueAt: { lt: new Date() } },
        include: { instance: { select: { businessKey: true, definition: { select: { name: true } } } } },
        take: 200,
      });
      for (const t of tasks) {
        await this.prisma.processTask.update({ where: { id: t.id }, data: { reminderSentAt: new Date() } });
        const recipientIds = await this.candidates(t);
        this.events.emit('process.task_overdue', null, {
          taskId: t.id, taskName: t.name, businessKey: t.instance.businessKey, processName: t.instance.definition.name, recipientIds,
        });
      }
    } catch (e) {
      console.error('Süreç hatırlatma çalışması başarısız', e);
    }
  }

  // ---------- Görevler listesine yansıtma ----------

  /**
   * Onay adımını Görevler listesine de düşürür: tek sorumlu varsa ona atanır; birim/rol adayıysa
   * atanmadan açılır ve adayların hepsi izleyici olur (kendi görev listelerinde görürler). Karar Onaylarım'dan verilir.
   */
  private async mirror(processTaskId: number, recipientIds: number[]) {
    try {
      const pt = await this.prisma.processTask.findUniqueOrThrow({
        where: { id: processTaskId },
        include: { instance: { select: { id: true, businessKey: true, startedById: true, definition: { select: { name: true } } } } },
      });
      if (pt.taskId) return;
      const status = await this.prisma.taskStatus.findFirst({ where: { projectId: null, isDone: false }, orderBy: { sortOrder: 'asc' } });
      if (!status) return;
      const creatorId = pt.instance.startedById ?? recipientIds[0];
      if (!creatorId) return;
      const assigneeId = pt.assigneeId ?? (recipientIds.length === 1 ? recipientIds[0] : null);
      const who = pt.candidateDeptId
        ? `${(await this.prisma.department.findUnique({ where: { id: pt.candidateDeptId }, select: { name: true } }))?.name ?? 'Birim'} birimindeki herkes`
        : pt.candidateRole ? `${pt.candidateRole} rolündekiler` : null;
      const last = await this.prisma.task.aggregate({ where: { statusId: status.id }, _max: { sortOrder: true } });
      const task = await this.prisma.task.create({
        data: {
          title: `${pt.name}: ${pt.instance.businessKey ?? pt.instance.definition.name}`.slice(0, 250),
          description: [
            `${pt.instance.definition.name} sürecinde kararınız bekleniyor.`,
            who && !assigneeId ? `Bu görevi ${who} görür; ilk karar veren kişi görevi kapatır.` : null,
            'Onaylamak veya reddetmek için görevdeki "Karar ver" düğmesini kullanın.',
          ].filter(Boolean).join('\n'),
          priority: 'high', statusId: status.id, assigneeId, createdById: creatorId, dueDate: pt.dueAt,
          relatedType: 'process_task', relatedId: String(pt.id), sortOrder: (last._max.sortOrder ?? -1) + 1,
          watchers: { create: [...new Set([...recipientIds, ...(assigneeId ? [assigneeId] : [])])].map((userId) => ({ userId })) },
        },
      });
      await this.prisma.processTask.update({ where: { id: pt.id }, data: { taskId: task.id } });
      this.events.emit('task.created', null, { taskId: task.id, title: task.title });
    } catch (e) {
      console.error(`Onay görevi #${processTaskId} Görevler listesine yansıtılamadı`, e);
    }
  }

  /** Karar verilince yansıyan görev tamamlanır; süreç iptalinde kaldırılır. */
  private async closeMirror(taskId: number | null, actorId: number | null, how: 'done' | 'removed') {
    if (!taskId) return;
    try {
      const t = await this.prisma.task.findUnique({ where: { id: taskId }, include: { status: true } });
      if (!t || t.deletedAt || t.status.isDone) return;
      if (how === 'removed') {
        await this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
        return;
      }
      const done = await this.prisma.taskStatus.findFirst({ where: { projectId: null, isDone: true }, orderBy: { sortOrder: 'asc' } });
      if (!done) return;
      await this.prisma.task.update({ where: { id: taskId }, data: { statusId: done.id, completedAt: new Date(), ...(t.assigneeId ? {} : { assigneeId: actorId }) } });
      this.events.emit('task.completed', actorId, { taskId, title: t.title, createdById: t.createdById });
    } catch (e) {
      console.error(`Görev #${taskId} kapatılamadı`, e);
    }
  }

  /** Açılışta: yansıtması olmayan açık onay görevlerini Görevler listesine ekler (eski kayıtlar için). */
  async backfillMirrors() {
    const open = await this.prisma.processTask.findMany({
      where: { status: 'open', taskId: null },
      select: { id: true, assigneeId: true, candidateRole: true, candidateDeptId: true },
    });
    for (const t of open) await this.mirror(t.id, await this.candidates(t));
    return open.length;
  }
}
