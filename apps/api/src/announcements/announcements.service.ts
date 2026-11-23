import { BadRequestException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf } from '../common/scope';
import { AnnouncementDto } from './announcements.dto';

const select = {
  id: true, title: true, body: true, important: true, allDepartments: true, startsAt: true, endsAt: true, createdAt: true,
  author: { select: { id: true, fullName: true } },
  departments: { select: { department: { select: { id: true, name: true } } } },
} satisfies Prisma.AnnouncementSelect;
type Row = Prisma.AnnouncementGetPayload<{ select: typeof select }>;

const shape = (a: Row) => ({ ...a, departments: a.departments.map((d) => d.department) });

/**
 * Duyurular: yetkili kişi (announcement.manage) tüm şirkete veya seçtiği birimlere duyuru açar.
 * Yayın süresince (startsAt..endsAt) hedef birimdeki herkesin üst çubuğunda kayan yazı olarak görünür;
 * açılınca hedef kişilere bildirim gider.
 */
@Injectable()
export class AnnouncementsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.notifications.registerRule('announcement.created', {
      label: 'Yeni duyuru',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: p.userIds as number[],
        n: { type: 'announcement.created', title: `Duyuru: ${p.title}`, body: (p.body as string | null) ?? '', link: '/announcements' },
      }),
    });
  }

  private assertManager(u: AuthUser) {
    if (!scopeOf(u, 'announcement.manage')) throw new ForbiddenException('Duyuru yönetme yetkiniz yok');
  }

  /** Kullanıcının şu an görmesi gereken duyurular (üst çubuktaki kayan yazı). */
  async active(u: AuthUser) {
    const now = new Date();
    const audience: Prisma.AnnouncementWhereInput[] = [{ allDepartments: true }, { authorId: u.id }];
    if (u.departmentId) audience.push({ departments: { some: { departmentId: u.departmentId } } });
    const rows = await this.prisma.announcement.findMany({
      where: { deletedAt: null, startsAt: { lte: now }, AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: audience }] },
      select, orderBy: [{ important: 'desc' }, { startsAt: 'desc' }], take: 20,
    });
    return rows.map(shape);
  }

  /** Yönetim listesi: süresi geçenler ve ileri tarihliler dahil. */
  async list(u: AuthUser) {
    this.assertManager(u);
    const rows = await this.prisma.announcement.findMany({ where: { deletedAt: null }, select, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(shape);
  }

  private async normalize(dto: AnnouncementDto) {
    const all = dto.allDepartments ?? false;
    const departmentIds = all ? [] : [...new Set(dto.departmentIds ?? [])];
    if (!all && !departmentIds.length) throw new BadRequestException('Duyurunun gideceği birimleri seçin veya "Tüm şirket"i işaretleyin');
    if (departmentIds.length) {
      const n = await this.prisma.department.count({ where: { id: { in: departmentIds } } });
      if (n !== departmentIds.length) throw new BadRequestException('Geçersiz birim');
    }
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('Bitiş, başlangıçtan sonra olmalı');
    return { all, departmentIds, startsAt, endsAt };
  }

  private async audienceIds(all: boolean, departmentIds: number[]) {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', ...(all ? {} : { departmentId: { in: departmentIds } }) },
      select: { id: true },
    });
    return users.map((x) => x.id);
  }

  async create(u: AuthUser, dto: AnnouncementDto) {
    this.assertManager(u);
    const { all, departmentIds, startsAt, endsAt } = await this.normalize(dto);
    const a = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(), body: dto.body?.trim() || null, important: dto.important ?? false,
        allDepartments: all, startsAt, endsAt, authorId: u.id,
        departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
      select,
    });
    await this.audit.log(u.id, 'announcement.create', 'announcement', a.id, dto);
    const userIds = (await this.audienceIds(all, departmentIds)).filter((id) => id !== u.id);
    if (userIds.length) this.events.emit('announcement.created', u.id, { id: a.id, title: a.title, body: a.body, userIds });
    return shape(a);
  }

  async update(u: AuthUser, id: number, dto: AnnouncementDto) {
    this.assertManager(u);
    const before = await this.prisma.announcement.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Duyuru bulunamadı');
    const { all, departmentIds, startsAt, endsAt } = await this.normalize(dto);
    await this.prisma.$transaction([
      this.prisma.announcementDepartment.deleteMany({ where: { announcementId: id } }),
      this.prisma.announcement.update({
        where: { id },
        data: {
          title: dto.title.trim(), body: dto.body?.trim() || null, important: dto.important ?? false, allDepartments: all, startsAt, endsAt,
          departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
        },
      }),
    ]);
    await this.audit.log(u.id, 'announcement.update', 'announcement', id, dto);
    return shape(await this.prisma.announcement.findUniqueOrThrow({ where: { id }, select }));
  }

  async remove(u: AuthUser, id: number) {
    this.assertManager(u);
    const r = await this.prisma.announcement.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!r.count) throw new NotFoundException('Duyuru bulunamadı');
    await this.audit.log(u.id, 'announcement.delete', 'announcement', id);
  }
}
