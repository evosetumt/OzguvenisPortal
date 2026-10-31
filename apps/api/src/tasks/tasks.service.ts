import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { uniqIds } from '../common/format';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../auth/auth.guard';
import { Scope, scopeOf, startOfTodayUtc, taskScopeWhere } from '../common/scope';
import { CreateTaskDto, MoveTaskDto, UpdateTaskDto } from './tasks.dto';

const userSel = { select: { id: true, fullName: true, avatarUrl: true } } as const;

const listInclude = {
  project: { select: { id: true, name: true, color: true } },
  status: { select: { id: true, name: true, isDone: true } },
  assignee: userSel,
  subtasks: { select: { done: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

export interface TaskFilter {
  projectId?: number;
  assigneeId?: number;
  mine?: boolean;
  q?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  private readScope(u: AuthUser): Scope {
    const s = scopeOf(u, 'task.read');
    if (!s) throw new ForbiddenException();
    return s;
  }

  private writeScope(u: AuthUser): Scope {
    const s = scopeOf(u, 'task.write');
    if (!s) throw new ForbiddenException('Görev düzenleme yetkiniz yok');
    return s;
  }

  /** Görevi kullanıcının görebildiği kapsamda getirir, yoksa 404 (varlığını sızdırmaz). */
  private async findVisible(u: AuthUser, id: number, scope: Scope, includeWatchers = true) {
    const t = await this.prisma.task.findFirst({
      where: { id, deletedAt: null, ...taskScopeWhere(u, scope, includeWatchers) },
      include: { status: true },
    });
    if (!t) throw new NotFoundException('Görev bulunamadı');
    return t;
  }

  /** Onay adımından gelen görev, karar verilmeden (Onaylarım'dan) elle tamamlanamaz. */
  private async assertNoPendingDecision(before: { relatedType: string | null; relatedId: string | null; status: { isDone: boolean } }, toDone: boolean) {
    if (!toDone || before.status.isDone || before.relatedType !== 'process_task' || !before.relatedId) return;
    const open = await this.prisma.processTask.count({ where: { id: Number(before.relatedId), status: 'open' } });
    if (open) throw new BadRequestException('Bu onay görevi "Karar ver" ile onaylanır veya reddedilir; karar verilince kendiliğinden tamamlanır');
  }

  private async assertCanAssign(u: AuthUser, scope: Scope, assigneeId: number) {
    if (assigneeId === u.id || scope === 'all') {
      if (assigneeId !== u.id) await this.assertActiveUser(assigneeId);
      return;
    }
    if (scope === 'department') {
      const a = await this.assertActiveUser(assigneeId);
      if (u.departmentId && a.departmentId === u.departmentId) return;
    }
    throw new ForbiddenException('Bu kişiye görev atama yetkiniz yok');
  }

  private async assertActiveUser(id: number) {
    const a = await this.prisma.user.findFirst({ where: { id, deletedAt: null, status: 'active' } });
    if (!a) throw new BadRequestException('Atanan kullanıcı bulunamadı');
    return a;
  }

  statuses() {
    return this.prisma.taskStatus.findMany({ where: { projectId: null }, orderBy: { sortOrder: 'asc' } });
  }

  async list(u: AuthUser, f: TaskFilter) {
    const and: Prisma.TaskWhereInput[] = [taskScopeWhere(u, this.readScope(u))];
    if (f.projectId) and.push({ projectId: f.projectId });
    if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
    if (f.mine) and.push({ OR: [{ assigneeId: u.id }, { createdById: u.id }] });
    if (f.q) and.push({ OR: [{ title: { contains: f.q } }, { customerRef: { contains: f.q } }, { erpDocNo: { contains: f.q } }] });
    const rows = await this.prisma.task.findMany({
      where: { deletedAt: null, AND: and },
      include: listInclude,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ subtasks, _count, ...t }) => ({
      ...t,
      subtaskTotal: subtasks.length,
      subtaskDone: subtasks.filter((s) => s.done).length,
      commentCount: _count.comments,
    }));
  }

  async summary(u: AuthUser, mine = false) {
    const base: Prisma.TaskWhereInput = {
      deletedAt: null,
      AND: [taskScopeWhere(u, this.readScope(u)), mine ? { assigneeId: u.id } : {}],
    };
    const open: Prisma.TaskWhereInput = { ...base, status: { isDone: false } };
    const today = startOfTodayUtc();
    const day = (today.getUTCDay() + 6) % 7; // pazartesi = 0
    const weekStart = new Date(today.getTime() - day * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const [openCount, dueThisWeek, overdue, completedThisWeek] = await Promise.all([
      this.prisma.task.count({ where: open }),
      this.prisma.task.count({ where: { ...open, dueDate: { gte: today, lt: weekEnd } } }),
      this.prisma.task.count({ where: { ...open, dueDate: { lt: today } } }),
      this.prisma.task.count({ where: { ...base, completedAt: { gte: weekStart } } }),
    ]);
    return { open: openCount, dueThisWeek, overdue, completedThisWeek };
  }

  async get(u: AuthUser, id: number) {
    await this.findVisible(u, id, this.readScope(u));
    const t = await this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: {
        ...listInclude,
        subtasks: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        comments: { include: { user: userSel }, orderBy: { createdAt: 'asc' } },
        watchers: { include: { user: userSel } },
        createdBy: userSel,
      },
    });
    const writeScope = scopeOf(u, 'task.write');
    const canEdit = !!writeScope && (await this.prisma.task.count({ where: { id, ...taskScopeWhere(u, writeScope, false) } })) > 0;
    return { ...t, watchers: t.watchers.map((w) => w.user), canEdit };
  }

  /** related: görevi açan kayıt (ör. toplantı sırasında açılan görev → { type: 'meeting', id }). */
  async create(u: AuthUser, dto: CreateTaskDto, related?: { type: string; id: number | string }) {
    const scope = this.writeScope(u);
    if (dto.assigneeId) await this.assertCanAssign(u, scope, dto.assigneeId);
    const statusId = dto.statusId ?? (await this.statuses())[0]?.id;
    if (!statusId) throw new BadRequestException('Görev durumu tanımlı değil (seed çalıştırıldı mı?)');
    const status = await this.prisma.taskStatus.findUnique({ where: { id: statusId } });
    if (!status) throw new BadRequestException('Geçersiz durum');
    const last = await this.prisma.task.aggregate({ where: { statusId }, _max: { sortOrder: true } });

    const watcherIds = uniqIds(u.id, dto.assigneeId);
    const task = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description,
        priority: dto.priority ?? 'normal',
        projectId: dto.projectId ?? null,
        statusId,
        assigneeId: dto.assigneeId ?? null,
        createdById: u.id,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        taskType: dto.taskType ?? 'general',
        customerRef: dto.customerRef ?? null,
        erpDocNo: dto.erpDocNo ?? null,
        relatedType: related?.type ?? null,
        relatedId: related ? String(related.id) : null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        completedAt: status.isDone ? new Date() : null,
        watchers: { create: watcherIds.map((userId) => ({ userId })) },
      },
    });
    await this.audit.log(u.id, 'task.create', 'task', task.id, dto);
    this.events.emit('task.created', u.id, { taskId: task.id, title: task.title });
    if (task.assigneeId) this.events.emit('task.assigned', u.id, { taskId: task.id, title: task.title, assigneeId: task.assigneeId });
    return this.get(u, task.id);
  }

  async update(u: AuthUser, id: number, dto: UpdateTaskDto) {
    const scope = this.writeScope(u);
    const before = await this.findVisible(u, id, scope, false);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    const diff: Record<string, [unknown, unknown]> = {};
    const set = <K extends keyof typeof before>(k: K, v: (typeof before)[K]) => {
      const old = before[k];
      const same = old instanceof Date && v instanceof Date ? old.getTime() === v.getTime() : old === v;
      if (!same) { (data as any)[k] = v; diff[k as string] = [old, v]; }
    };

    if (dto.title !== undefined) set('title', dto.title.trim());
    if (dto.description !== undefined) set('description', dto.description);
    if (dto.priority !== undefined) set('priority', dto.priority);
    if (dto.projectId !== undefined) set('projectId', dto.projectId);
    if (dto.taskType !== undefined) set('taskType', dto.taskType);
    if (dto.customerRef !== undefined) set('customerRef', dto.customerRef);
    if (dto.erpDocNo !== undefined) set('erpDocNo', dto.erpDocNo);
    if (dto.dueDate !== undefined) {
      set('dueDate', dto.dueDate ? new Date(dto.dueDate) : null);
      if ('dueDate' in data) data.reminderSentAt = null; // yeni tarih için yeniden hatırlat
    }
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) await this.assertCanAssign(u, scope, dto.assigneeId);
      set('assigneeId', dto.assigneeId);
    }
    let newStatus = before.status;
    if (dto.statusId !== undefined && dto.statusId !== before.statusId) {
      const s = await this.prisma.taskStatus.findUnique({ where: { id: dto.statusId } });
      if (!s) throw new BadRequestException('Geçersiz durum');
      newStatus = s;
      await this.assertNoPendingDecision(before, s.isDone);
      set('statusId', s.id);
      if (s.isDone !== before.status.isDone) data.completedAt = s.isDone ? new Date() : null;
      // Kolon değişince kartı yeni kolonun sonuna koy.
      const last = await this.prisma.task.aggregate({ where: { statusId: s.id }, _max: { sortOrder: true } });
      data.sortOrder = (last._max.sortOrder ?? -1) + 1;
    }
    if (!Object.keys(diff).length) return this.get(u, id);

    await this.prisma.task.update({ where: { id }, data });
    await this.afterChange(u, before, newStatus, data, diff);
    return this.get(u, id);
  }

  /** Sürükle-bırak: görevi bir kolonda belirli sıraya yerleştirir ve kolonu yeniden numaralar. */
  async move(u: AuthUser, id: number, dto: MoveTaskDto) {
    const scope = this.writeScope(u);
    const before = await this.findVisible(u, id, scope, false);
    const status = await this.prisma.taskStatus.findUnique({ where: { id: dto.statusId } });
    if (!status) throw new BadRequestException('Geçersiz durum');
    await this.assertNoPendingDecision(before, status.isDone);

    const siblings = await this.prisma.task.findMany({
      where: { statusId: status.id, deletedAt: null, id: { not: id } },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    // index, istemcinin gördüğü (kapsamla süzülmüş) listeye göredir; görünmeyen kartlar arada kalabilir, sıra yine tutarlıdır.
    const ids = siblings.map((s) => s.id);
    ids.splice(Math.min(dto.index, ids.length), 0, id);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    const diff: Record<string, [unknown, unknown]> = {};
    if (status.id !== before.statusId) {
      data.statusId = status.id;
      diff.statusId = [before.statusId, status.id];
      if (status.isDone !== before.status.isDone) data.completedAt = status.isDone ? new Date() : null;
    }
    await this.prisma.$transaction([
      this.prisma.task.update({ where: { id }, data }),
      ...ids.map((tid, i) => this.prisma.task.update({ where: { id: tid }, data: { sortOrder: i } })),
    ]);
    if (Object.keys(diff).length) await this.afterChange(u, before, status, data, diff);
    return { ok: true };
  }

  private async afterChange(
    u: AuthUser,
    before: { id: number; title: string; createdById: number; assigneeId: number | null; status: { isDone: boolean } },
    newStatus: { isDone: boolean },
    data: Prisma.TaskUncheckedUpdateInput,
    diff: Record<string, unknown>,
  ) {
    await this.audit.log(u.id, 'task.update', 'task', before.id, diff);
    const title = (data.title as string) ?? before.title;
    if (typeof data.assigneeId === 'number') {
      await this.prisma.taskWatcher.upsert({
        where: { taskId_userId: { taskId: before.id, userId: data.assigneeId } },
        update: {},
        create: { taskId: before.id, userId: data.assigneeId },
      });
      this.events.emit('task.assigned', u.id, { taskId: before.id, title, assigneeId: data.assigneeId });
    }
    if ('statusId' in diff) {
      this.events.emit('task.status_changed', u.id, { taskId: before.id, title, from: (diff.statusId as number[])[0], to: data.statusId });
      if (newStatus.isDone && !before.status.isDone) {
        this.events.emit('task.completed', u.id, { taskId: before.id, title, createdById: before.createdById, recipientIds: await this.followers({ ...before, assigneeId: typeof data.assigneeId === 'number' ? data.assigneeId : before.assigneeId }) });
      }
    }
  }

  async remove(u: AuthUser, id: number) {
    await this.findVisible(u, id, this.writeScope(u), false);
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'task.delete', 'task', id);
  }

  // ---------- Alt görevler ----------

  async addSubtask(u: AuthUser, taskId: number, title: string) {
    await this.findVisible(u, taskId, this.writeScope(u), false);
    const last = await this.prisma.taskSubtask.aggregate({ where: { taskId }, _max: { sortOrder: true } });
    return this.prisma.taskSubtask.create({ data: { taskId, title: title.trim(), sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  }

  async updateSubtask(u: AuthUser, id: number, dto: { title?: string; done?: boolean }) {
    const s = await this.prisma.taskSubtask.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    const task = await this.findVisible(u, s.taskId, this.writeScope(u), false);
    const updated = await this.prisma.taskSubtask.update({ where: { id }, data: { title: dto.title?.trim(), done: dto.done } });
    if (dto.done === true && !s.done) {
      const [actor, recipientIds] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: u.id }, select: { fullName: true } }),
        this.followers(task),
      ]);
      this.events.emit('task.subtask_done', u.id, {
        taskId: s.taskId, title: task.title, subtask: updated.title, actorName: actor?.fullName ?? '', recipientIds,
      });
    }
    return updated;
  }

  /** Görevi açan, sorumlusu ve takipçileri (bildirim alıcıları); görev satırı çağıranda zaten var, yalnız takipçiler okunur. */
  private async followers(t: { id: number; assigneeId: number | null; createdById: number }) {
    const watchers = await this.prisma.taskWatcher.findMany({ where: { taskId: t.id }, select: { userId: true } });
    return uniqIds(t.assigneeId, t.createdById, ...watchers.map((w) => w.userId));
  }

  async removeSubtask(u: AuthUser, id: number) {
    const s = await this.prisma.taskSubtask.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    await this.findVisible(u, s.taskId, this.writeScope(u), false);
    await this.prisma.taskSubtask.delete({ where: { id } });
  }

  // ---------- Yorumlar ----------

  async addComment(u: AuthUser, taskId: number, body: string) {
    const task = await this.findVisible(u, taskId, this.readScope(u));
    const [comment, followers] = await Promise.all([
      this.prisma.taskComment.create({ data: { taskId, userId: u.id, body: body.trim() }, include: { user: userSel } }),
      this.followers(task),
      this.prisma.taskWatcher.upsert({
        where: { taskId_userId: { taskId, userId: u.id } },
        update: {},
        create: { taskId, userId: u.id },
      }),
    ]);
    const recipientIds = uniqIds(...followers, u.id); // yorum yapan da takipçi olur (kendi eylemi için bildirim almaz)
    this.events.emit('task.commented', u.id, {
      taskId,
      title: task.title,
      authorName: comment.user.fullName,
      excerpt: comment.body.length > 120 ? comment.body.slice(0, 117) + '…' : comment.body,
      recipientIds,
    });
    return comment;
  }

  async removeComment(u: AuthUser, id: number) {
    const c = await this.prisma.taskComment.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    if (c.userId !== u.id && scopeOf(u, 'task.write') !== 'all') throw new ForbiddenException();
    await this.prisma.taskComment.delete({ where: { id } });
  }
}
