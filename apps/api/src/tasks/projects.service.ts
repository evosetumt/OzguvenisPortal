import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf, taskScopeWhere } from '../common/scope';
import { ProjectDto, UpdateProjectDto } from './tasks.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Projeler etiket niteliğindedir; herkes görür. Açık görev sayısı kullanıcının kapsamına göre sayılır. */
  async list(u: AuthUser) {
    const scope = scopeOf(u, 'task.read');
    if (!scope) throw new ForbiddenException();
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: 'active' },
      orderBy: [{ pinned: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, color: true, pinned: true, ownerId: true },
    });
    const counts = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: { deletedAt: null, status: { isDone: false }, ...taskScopeWhere(u, scope) },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((c) => [c.projectId, c._count._all]));
    return projects.map((p) => ({ ...p, openTasks: byId.get(p.id) ?? 0 }));
  }

  async create(u: AuthUser, dto: ProjectDto) {
    const p = await this.prisma.project.create({
      data: { name: dto.name.trim(), color: dto.color, pinned: dto.pinned ?? false, ownerId: u.id },
    });
    await this.audit.log(u.id, 'project.create', 'project', p.id, dto);
    return p;
  }

  async update(u: AuthUser, id: number, dto: UpdateProjectDto) {
    const p = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw new NotFoundException();
    if (p.ownerId !== u.id && scopeOf(u, 'task.write') !== 'all') throw new ForbiddenException('Yalnızca proje sahibi düzenleyebilir');
    const r = await this.prisma.project.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } });
    await this.audit.log(u.id, 'project.update', 'project', id, dto);
    return r;
  }
}
