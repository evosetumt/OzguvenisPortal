import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../auth/auth.guard';
import { ProcessEngine, decisionsOf } from './process-engine.service';
import { validateBpmn } from './bpmn-model';
import { EMPTY_PROCESS_XML } from './default-processes';

const defSelect = {
  id: true, key: true, name: true, version: true, status: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { instances: true } },
} as const;
const userSel = { select: { id: true, fullName: true } } as const;

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProcessEngine,
    private readonly audit: AuditService,
  ) {}

  // ---------- Tanımlar ----------

  listDefinitions() {
    return this.prisma.processDefinition.findMany({ select: defSelect, orderBy: [{ key: 'asc' }, { version: 'desc' }] });
  }

  async getDefinition(id: number) {
    const d = await this.prisma.processDefinition.findUnique({ where: { id }, select: { ...defSelect, bpmnXml: true } });
    if (!d) throw new NotFoundException('Süreç tanımı bulunamadı');
    return d;
  }

  async createDefinition(u: AuthUser, key: string, name: string, bpmnXml?: string) {
    if (await this.prisma.processDefinition.findFirst({ where: { key } })) throw new ConflictException('Bu anahtarla bir süreç zaten var');
    const d = await this.prisma.processDefinition.create({
      data: { key, name: name.trim(), bpmnXml: bpmnXml ?? EMPTY_PROCESS_XML(key, name), createdById: u.id },
      select: defSelect,
    });
    await this.audit.log(u.id, 'workflow.create', 'process_definition', d.id, { key, name });
    return d;
  }

  /**
   * Taslak kaydı. Etkin veya arşiv sürüm düzenlenirse yeni taslak sürüm açılır (varsa mevcut taslağın üzerine yazılır);
   * çalışan örnekler kendi sürümüyle devam eder.
   */
  async saveDraft(u: AuthUser, id: number, bpmnXml: string, name?: string) {
    const d = await this.prisma.processDefinition.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Süreç tanımı bulunamadı');
    let target = d;
    if (d.status !== 'draft') {
      const draft = await this.prisma.processDefinition.findFirst({ where: { key: d.key, status: 'draft' }, orderBy: { version: 'desc' } });
      if (draft) target = draft;
      else {
        const max = await this.prisma.processDefinition.aggregate({ where: { key: d.key }, _max: { version: true } });
        const created = await this.prisma.processDefinition.create({
          data: { key: d.key, name: name?.trim() || d.name, version: (max._max.version ?? 0) + 1, bpmnXml, createdById: u.id },
          select: defSelect,
        });
        await this.audit.log(u.id, 'workflow.new_version', 'process_definition', created.id, { key: d.key, version: created.version });
        return created;
      }
    }
    const saved = await this.prisma.processDefinition.update({
      where: { id: target.id }, data: { bpmnXml, name: name?.trim() || undefined }, select: defSelect,
    });
    await this.audit.log(u.id, 'workflow.save', 'process_definition', saved.id);
    return saved;
  }

  validate(bpmnXml: string) {
    return { errors: validateBpmn(bpmnXml, this.engine.handlerNames()) };
  }

  /** Doğrulanmış taslağı etkin yapar; aynı anahtarın önceki etkin sürümü arşivlenir. */
  async publish(u: AuthUser, id: number) {
    const d = await this.prisma.processDefinition.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Süreç tanımı bulunamadı');
    if (d.status === 'active') return this.getDefinition(id);
    const errors = validateBpmn(d.bpmnXml, this.engine.handlerNames());
    if (errors.length) throw new BadRequestException({ message: errors, error: 'Doğrulama hatası' });
    await this.prisma.$transaction([
      this.prisma.processDefinition.updateMany({ where: { key: d.key, status: 'active' }, data: { status: 'archived' } }),
      this.prisma.processDefinition.update({ where: { id }, data: { status: 'active' } }),
    ]);
    await this.audit.log(u.id, 'workflow.publish', 'process_definition', id, { key: d.key, version: d.version });
    return this.getDefinition(id);
  }

  async archive(u: AuthUser, id: number) {
    const d = await this.prisma.processDefinition.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Süreç tanımı bulunamadı');
    await this.prisma.processDefinition.update({ where: { id }, data: { status: 'archived' } });
    await this.audit.log(u.id, 'workflow.archive', 'process_definition', id);
    return { ok: true };
  }

  // ---------- Örnekler ----------

  private canMonitorAll(u: AuthUser) {
    return 'workflow.design' in u.permissions;
  }

  async listInstances(u: AuthUser, f: { status?: string; definitionKey?: string }) {
    const where: Prisma.ProcessInstanceWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.definitionKey ? { definition: { key: f.definitionKey } } : {}),
      ...(this.canMonitorAll(u) ? {} : { startedById: u.id }),
    };
    return this.prisma.processInstance.findMany({
      where,
      select: {
        id: true, businessKey: true, entityType: true, entityId: true, status: true, startedAt: true, endedAt: true, error: true,
        definition: { select: { id: true, key: true, name: true, version: true } },
        startedBy: userSel,
        tasks: { where: { status: 'open' }, select: { id: true, name: true, assignee: userSel, candidateRole: true, candidateDeptId: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
  }

  async getInstance(u: AuthUser, id: number) {
    const inst = await this.prisma.processInstance.findUnique({
      where: { id },
      include: {
        definition: { select: { id: true, key: true, name: true, version: true, bpmnXml: true } },
        startedBy: userSel,
        tasks: { include: { assignee: userSel, completedBy: userSel }, orderBy: { id: 'asc' } },
        events: { orderBy: { id: 'asc' } },
      },
    });
    if (!inst) throw new NotFoundException('Süreç bulunamadı');
    if (!this.canMonitorAll(u) && inst.startedById !== u.id) {
      const mine = await this.prisma.processTask.count({ where: { instanceId: id, ...(await this.engine.taskAccessWhere(u.id)) } });
      if (!mine) throw new NotFoundException('Süreç bulunamadı');
    }
    const completed = [...new Set(inst.events.filter((e) => e.type === 'completed' && e.elementId).map((e) => e.elementId!))];
    const active = inst.tasks.filter((t) => t.status === 'open').map((t) => t.elementId);
    const failedAt = inst.status === 'failed' ? inst.events.filter((e) => e.type === 'error').at(-1)?.elementId ?? null : null;
    return {
      ...inst,
      variables: safeJson(inst.variables),
      events: inst.events.map((e) => ({ ...e, payload: e.payload ? safeJson(e.payload) : null })),
      tasks: inst.tasks.map((t) => ({ ...t, formData: t.formData ? safeJson(t.formData) : null })),
      highlight: { completed, active, failed: failedAt },
    };
  }

  // ---------- Görev kutusu ----------

  async myTasks(u: AuthUser, done: boolean) {
    const access = await this.engine.taskAccessWhere(u.id);
    const tasks = await this.prisma.processTask.findMany({
      where: done ? { completedById: u.id, status: 'completed' } : { status: 'open', ...access },
      include: {
        assignee: userSel,
        completedBy: userSel,
        instance: {
          select: {
            id: true, businessKey: true, entityType: true, entityId: true, definitionId: true, startedAt: true,
            startedBy: userSel, definition: { select: { name: true, key: true } },
          },
        },
      },
      orderBy: done ? { completedAt: 'desc' } : { createdAt: 'asc' },
      take: done ? 50 : 200,
    });
    const out = [];
    for (const t of await this.engine.candidateLabels(tasks)) {
      const model = await this.engine.model(t.instance.definitionId);
      out.push({
        ...t,
        formData: t.formData ? safeJson(t.formData) : null,
        decisions: decisionsOf(model.elements.get(t.elementId)),
        overdue: t.status === 'open' && !!t.dueAt && t.dueAt < new Date(),
      });
    }
    return out;
  }

  complete(u: AuthUser, id: number, decision: string, comment?: string) {
    return this.engine.completeTask(u, id, decision, comment);
  }

  /** Tasarımcıdaki "Birim" seçenekleri: "(demo)" gibi ekler atılır, aynı ad bir kez listelenir. */
  async departments() {
    const rows = await this.prisma.department.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    return [...new Set(rows.map((r) => r.name.replace(/\s*\(.*\)\s*$/, '').trim()))];
  }

  async roles() {
    const roles = await this.prisma.role.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
    return roles.map((r) => r.name);
  }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
