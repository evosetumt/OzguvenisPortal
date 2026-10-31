import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf, taskScopeWhere } from '../common/scope';
import { CalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

const userSel = { select: { id: true, fullName: true } } as const;

/**
 * Takvim öğesi: kendi etkinlikleri, görev bitiş tarihleri ve registerSource ile eklenen diğer modül kayıtları
 * (sözleşme bitişi, toplantı, sevkiyat ...). Diğer modül öğeleri tıklanınca `link` adresine gider.
 */
export interface CalendarItem {
  key: string;
  kind: string; // event | task | modül türü (meeting, tracking, shipment ...)
  id: number;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color?: string;
  done?: boolean;
  visibility?: string;
  location?: string | null;
  description?: string | null;
  owner?: { id: number; fullName: string };
  attendees?: { id: number; fullName: string }[];
  canEdit?: boolean;
  link?: string;
}

/** Modül kaynağı: kullanıcının yetkisine göre [from, to) aralığındaki öğeleri döner. */
export type CalendarSource = (u: AuthUser, from: Date, to: Date) => Promise<CalendarItem[]>;

@Injectable()
export class CalendarService {
  private readonly sources: CalendarSource[] = [];

  /** Diğer modüller (CalendarModule'ü import ederek) kendi kayıtlarını takvime yansıtır. */
  registerSource(source: CalendarSource) {
    this.sources.push(source);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  private eventScopeWhere(u: AuthUser): Prisma.CalendarEventWhereInput {
    const or: Prisma.CalendarEventWhereInput[] = [
      { ownerId: u.id },
      { attendees: { some: { userId: u.id } } },
      { visibility: 'company' },
    ];
    const scope = scopeOf(u, 'calendar.read');
    if (scope === 'all') or.push({ visibility: 'department' });
    else if (u.departmentId) or.push({ visibility: 'department', owner: { departmentId: u.departmentId } });
    return { OR: or };
  }

  async range(u: AuthUser, from: Date, to: Date): Promise<CalendarItem[]> {
    if (!(from < to) || to.getTime() - from.getTime() > 120 * 86400000) throw new BadRequestException('Geçersiz tarih aralığı');
    const events = await this.prisma.calendarEvent.findMany({
      where: { deletedAt: null, startsAt: { lt: to }, endsAt: { gte: from }, ...this.eventScopeWhere(u) },
      include: { owner: userSel, attendees: { include: { user: userSel } } },
      orderBy: { startsAt: 'asc' },
    });
    const items: CalendarItem[] = events.map((e) => ({
      key: `event-${e.id}`,
      kind: 'event',
      id: e.id,
      title: e.title,
      start: e.startsAt,
      end: e.endsAt,
      allDay: e.allDay,
      visibility: e.visibility,
      location: e.location,
      description: e.description,
      owner: e.owner,
      attendees: e.attendees.map((a) => a.user),
      canEdit: e.ownerId === u.id,
    }));

    const taskScope = scopeOf(u, 'task.read');
    if (taskScope) {
      const tasks = await this.prisma.task.findMany({
        where: { deletedAt: null, dueDate: { gte: from, lt: to }, ...taskScopeWhere(u, taskScope) },
        select: { id: true, title: true, dueDate: true, status: { select: { isDone: true } }, project: { select: { color: true } } },
      });
      for (const t of tasks) {
        items.push({
          key: `task-${t.id}`,
          kind: 'task',
          id: t.id,
          title: t.title,
          start: t.dueDate!,
          end: t.dueDate!,
          allDay: true,
          color: t.project?.color,
          done: t.status.isDone,
        });
      }
    }
    for (const source of this.sources) {
      try {
        items.push(...(await source(u, from, to)));
      } catch (e) {
        console.error('Takvim kaynağı hatası', e); // bir modülün hatası takvimi bozmasın
      }
    }
    return items.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private validateTimes(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
      throw new BadRequestException('Bitiş, başlangıçtan önce olamaz');
    }
  }

  async create(u: AuthUser, dto: CalendarEventDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.validateTimes(startsAt, endsAt);
    const attendeeIds = [...new Set(dto.attendeeIds ?? [])].filter((id) => id !== u.id);
    const e = await this.prisma.calendarEvent.create({
      data: {
        title: dto.title.trim(),
        description: dto.description,
        location: dto.location,
        startsAt,
        endsAt,
        allDay: dto.allDay ?? false,
        visibility: dto.visibility ?? 'private',
        ownerId: u.id,
        attendees: { create: attendeeIds.map((userId) => ({ userId })) },
      },
    });
    await this.audit.log(u.id, 'calendar.create', 'calendar_event', e.id, dto);
    if (attendeeIds.length) this.events.emit('calendar.invited', u.id, { eventId: e.id, title: e.title, startsAt, userIds: attendeeIds });
    return e;
  }

  private async ownEvent(u: AuthUser, id: number) {
    const e = await this.prisma.calendarEvent.findFirst({
      where: { id, deletedAt: null },
      include: { attendees: true },
    });
    if (!e) throw new NotFoundException('Etkinlik bulunamadı');
    if (e.ownerId !== u.id) throw new ForbiddenException('Yalnızca etkinliği oluşturan düzenleyebilir');
    return e;
  }

  async update(u: AuthUser, id: number, dto: UpdateCalendarEventDto) {
    const before = await this.ownEvent(u, id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : before.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : before.endsAt;
    this.validateTimes(startsAt, endsAt);

    let newAttendees: number[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          description: dto.description,
          location: dto.location,
          allDay: dto.allDay,
          visibility: dto.visibility,
          startsAt,
          endsAt,
        },
      });
      if (dto.attendeeIds) {
        const next = new Set(dto.attendeeIds.filter((x) => x !== u.id));
        const prev = new Set(before.attendees.map((a) => a.userId));
        newAttendees = [...next].filter((x) => !prev.has(x));
        await tx.calendarEventAttendee.deleteMany({ where: { eventId: id, userId: { notIn: [...next] } } });
        if (newAttendees.length) await tx.calendarEventAttendee.createMany({ data: newAttendees.map((userId) => ({ eventId: id, userId })) });
      }
    });
    await this.audit.log(u.id, 'calendar.update', 'calendar_event', id, dto);
    if (newAttendees.length) {
      this.events.emit('calendar.invited', u.id, { eventId: id, title: dto.title ?? before.title, startsAt, userIds: newAttendees });
    }
    return { ok: true };
  }

  async remove(u: AuthUser, id: number) {
    await this.ownEvent(u, id);
    await this.prisma.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'calendar.delete', 'calendar_event', id);
  }
}
