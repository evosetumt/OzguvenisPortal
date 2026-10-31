import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarService } from '../calendar/calendar.service';
import { ChatService } from '../chat/chat.service';
import { TasksService } from '../tasks/tasks.service';
import { CallsService } from '../calls/calls.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf } from '../common/scope';
import { MeetingDto, MeetingTaskDto } from './meetings.dto';

const userSel = { select: { id: true, fullName: true, avatarUrl: true } } as const;
const JOIN_EARLY_MS = 15 * 60_000; // başlangıçtan 15 dk önce katılınabilir (denetim CallsService.joinMeeting'de)
const fmt = (d: Date) => d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

/** Toplantıda başkasına görev açabilenler: görev yazma kapsamı tüm şirket veya departman olanlar (yöneticiler). */
const canAssignTasks = (u: AuthUser) => ['all', 'department'].includes(scopeOf(u, 'task.write') ?? '');

const mine = (u: AuthUser): Prisma.MeetingWhereInput => ({
  deletedAt: null,
  OR: [{ organizerId: u.id }, { participants: { some: { userId: u.id } } }],
});

@Injectable()
export class MeetingsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
    private readonly chat: ChatService,
    private readonly tasks: TasksService,
    private readonly calls: CallsService,
  ) {}

  onModuleInit() {
    this.notifications.registerRule('meeting.invited', {
      label: 'Toplantı daveti',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'meeting.invited', title: 'Toplantıya davet edildiniz', body: `${p.title} · ${fmt(new Date(p.startsAt))}`, link: `/meetings?id=${p.meetingId}` },
      }),
    });
    this.notifications.registerRule('meeting.cancelled', {
      label: 'Toplantı iptal edildi',
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'meeting.cancelled', title: 'Toplantı iptal edildi', body: `${p.title} · ${fmt(new Date(p.startsAt))}`, link: '/meetings' },
      }),
    });

    // Toplantılar takvime ayrı bir kaynak olarak yansır (yalnızca düzenleyen ve katılımcılar görür).
    // Ayrıca calendar_events kaydı açılmaz; aksi halde aynı toplantı takvimde iki kez görünürdü.
    this.calendar.registerSource(async (u, from, to) => {
      const rows = await this.prisma.meeting.findMany({
        where: { ...mine(u), startsAt: { lt: to }, endsAt: { gte: from } },
        include: { organizer: userSel, participants: { include: { user: userSel } } },
      });
      return rows.map((m) => ({
        key: `meeting-${m.id}`,
        kind: 'meeting',
        id: m.id,
        title: m.title,
        start: m.startsAt,
        end: m.endsAt,
        allDay: false,
        color: '#a78bfa',
        owner: m.organizer,
        attendees: m.participants.map((p) => p.user),
        link: `/meetings?id=${m.id}`,
      }));
    });
  }

  private present(m: Prisma.MeetingGetPayload<{ include: { organizer: typeof userSel; participants: { include: { user: typeof userSel } } } }>, u: AuthUser) {
    const { participants, ...rest } = m;
    const now = Date.now();
    return {
      ...rest,
      participants: participants.map((p) => p.user),
      canEdit: m.organizerId === u.id,
      canAssignTasks: canAssignTasks(u),
      joinable: now >= m.startsAt.getTime() - JOIN_EARLY_MS && now <= m.endsAt.getTime(),
    };
  }

  private include = { organizer: userSel, participants: { include: { user: userSel } } } as const;

  async list(u: AuthUser, when: 'upcoming' | 'past') {
    const now = new Date();
    const rows = await this.prisma.meeting.findMany({
      where: { ...mine(u), ...(when === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } }) },
      include: this.include,
      orderBy: { startsAt: when === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
    });
    return rows.map((m) => this.present(m, u));
  }

  async get(u: AuthUser, id: number) {
    const m = await this.prisma.meeting.findFirst({ where: { id, ...mine(u) }, include: this.include });
    if (!m) throw new NotFoundException('Toplantı bulunamadı');
    return this.present(m, u);
  }

  async create(u: AuthUser, dto: MeetingDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(endsAt > startsAt)) throw new BadRequestException('Bitiş, başlangıçtan sonra olmalı');
    if (endsAt.getTime() - startsAt.getTime() > 24 * 3600_000) throw new BadRequestException('Toplantı en fazla 24 saat sürebilir');

    let ids = dto.participantIds ?? [];
    if (dto.conversationId) {
      const { ids: memberIds } = await this.chat.memberIds(u, dto.conversationId);
      if (!dto.participantIds) ids = memberIds;
    }
    ids = [...new Set(ids)].filter((x) => x !== u.id);
    if (ids.length) {
      const n = await this.prisma.user.count({ where: { id: { in: ids }, deletedAt: null, status: 'active' } });
      if (n !== ids.length) throw new BadRequestException('Geçersiz katılımcı');
    }

    const m = await this.prisma.meeting.create({
      data: {
        title: dto.title.trim(),
        roomName: `ozg-${randomUUID()}`,
        startsAt,
        endsAt,
        organizerId: u.id,
        conversationId: dto.conversationId,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
      include: this.include,
    });
    await this.audit.log(u.id, 'meeting.create', 'meeting', m.id, { title: m.title, startsAt, endsAt, participantIds: ids });
    if (ids.length) this.events.emit('meeting.invited', u.id, { meetingId: m.id, title: m.title, startsAt, userIds: ids });
    return this.present(m, u);
  }

  async cancel(u: AuthUser, id: number) {
    const m = await this.prisma.meeting.findFirst({ where: { id, deletedAt: null }, include: { participants: true } });
    if (!m) throw new NotFoundException('Toplantı bulunamadı');
    if (m.organizerId !== u.id) throw new ForbiddenException('Yalnızca düzenleyen iptal edebilir');
    await this.prisma.meeting.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'meeting.cancel', 'meeting', id);
    const userIds = m.participants.map((p) => p.userId);
    if (userIds.length && m.endsAt > new Date()) this.events.emit('meeting.cancelled', u.id, { meetingId: id, title: m.title, startsAt: m.startsAt, userIds });
  }

  /** Toplantıya katıl: WebRTC oturumu (katılımcı listesi, ICE sunucuları). Süre ve erişim denetimi CallsService'te. */
  join(u: AuthUser, id: number) {
    return this.calls.joinMeeting(u, id);
  }

  /** Toplantının canlı oturum(lar)ında kim ne zaman girip çıktı. */
  attendance(u: AuthUser, id: number) {
    return this.calls.meetingAttendance(u, id);
  }

  private async visible(u: AuthUser, id: number) {
    const m = await this.prisma.meeting.findFirst({ where: { id, ...mine(u) }, select: { id: true, title: true } });
    if (!m) throw new NotFoundException('Toplantı bulunamadı');
    return m;
  }

  /** Kişiye özel not: yalnızca sahibi okur ve yazar (toplantı sırasında ve sonrasında). */
  async note(u: AuthUser, id: number) {
    await this.visible(u, id);
    const n = await this.prisma.meetingNote.findUnique({ where: { meetingId_userId: { meetingId: id, userId: u.id } } });
    return { body: n?.body ?? '', updatedAt: n?.updatedAt ?? null };
  }

  async saveNote(u: AuthUser, id: number, body: string) {
    await this.visible(u, id);
    const n = await this.prisma.meetingNote.upsert({
      where: { meetingId_userId: { meetingId: id, userId: u.id } },
      create: { meetingId: id, userId: u.id, body },
      update: { body },
    });
    return { body: n.body, updatedAt: n.updatedAt };
  }

  /** Toplantıda açılan görevler (tüm katılımcılar görür). */
  async meetingTasks(u: AuthUser, id: number) {
    await this.visible(u, id);
    return this.prisma.task.findMany({
      where: { relatedType: 'meeting', relatedId: String(id), deletedAt: null },
      select: {
        id: true, title: true, dueDate: true, priority: true, createdAt: true,
        status: { select: { id: true, name: true, isDone: true } }, assignee: userSel, createdBy: userSel,
      },
      orderBy: { id: 'asc' },
    });
  }

  /** Yönetici toplantı sırasında istediği kişiye görev açar; görev toplantıya bağlı kalır. */
  async createTask(u: AuthUser, id: number, dto: MeetingTaskDto) {
    const m = await this.visible(u, id);
    if (!canAssignTasks(u)) throw new ForbiddenException('Toplantıda görev açma yalnızca yöneticilere açık');
    const desc = [dto.description?.trim(), `Toplantı: ${m.title}`].filter(Boolean).join('\n\n');
    return this.tasks.create(u, {
      title: dto.title, description: desc, assigneeId: dto.assigneeId, dueDate: dto.dueDate ?? null, priority: dto.priority,
    }, { type: 'meeting', id });
  }
}
