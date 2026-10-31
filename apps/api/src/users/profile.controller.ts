import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Res, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { SettingsService } from '../common/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { scopeOf, startOfTodayUtc } from '../common/scope';

const DAY = 86400000;
export const PRESENCE = ['online', 'focus', 'meeting', 'away'] as const;
const AVATAR_DIR = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'uploads'), 'avatars');
const AVATAR_FILE = /^\d+-[a-f0-9]{16}\.(webp|png|jpg)$/;
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

/** Kullanıcı yalnızca durumunu ve görünüm tercihlerini değiştirir; e-posta ve telefonu yönetici (Kullanıcılar) değiştirir. */
export const THEMES = ['light', 'dark', 'auto'] as const;
export const WALLPAPERS = ['duz', 'kul', 'kum', 'adacayi', 'kutup', 'duman', 'gelgit', 'cicek', 'kor', 'koru', 'alacakaranlik'] as const;
export const ACCENTS = ['mavi', 'mor', 'pembe', 'turuncu', 'yesil', 'grafit', 'altin'] as const;

class UiPrefsDto {
  @IsOptional() @IsIn(THEMES) theme?: string;
  @IsOptional() @IsIn(WALLPAPERS) wallpaper?: string;
  @IsOptional() @IsIn(ACCENTS) accent?: string;
}

class UpdateMeDto {
  @IsOptional() @IsIn(PRESENCE) presence?: string;
  @IsOptional() @ValidateNested() @Type(() => UiPrefsDto) ui?: UiPrefsDto;
}

class AvatarDto {
  /** İstemcide kareye kırpılıp küçültülmüş görsel: data:image/webp;base64,... (en fazla ~700 KB) */
  @IsString() @MaxLength(1_000_000) @Matches(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/, { message: 'Geçersiz görsel' })
  dataUrl: string;
}

const userCard = {
  id: true, fullName: true, email: true, phone: true, title: true, avatarUrl: true, presence: true, presenceAt: true, lastLoginAt: true,
  departmentId: true, department: { select: { id: true, name: true, managerId: true } },
} satisfies Prisma.UserSelect;

/** Ekip rehberi, kişi profili ve kendi hesabım (profil fotoğrafı, telefon, durum). */
@Controller()
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Başkasının görevlerini görebilir mi: task.read all → herkes, department → aynı birim, own → yalnız kendisi. */
  private canSeeTasks(u: AuthUser, target: { id: number; departmentId: number | null }) {
    if (u.id === target.id) return true;
    const s = scopeOf(u, 'task.read');
    return s === 'all' || (s === 'department' && !!u.departmentId && u.departmentId === target.departmentId);
  }

  private week() {
    const today = startOfTodayUtc();
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    return { today, monday, nextMonday: new Date(monday.getTime() + 7 * DAY) };
  }

  @Get('team')
  @UseGuards(AuthGuard)
  async team(@CurrentUser() u: AuthUser) {
    const capacity = await this.settings.get<number>('report.workloadCapacity', 8);
    const { today, monday, nextMonday } = this.week();
    const users = await this.prisma.user.findMany({ where: { deletedAt: null, status: 'active' }, select: userCard, orderBy: { fullName: 'asc' } });
    const visible = users.filter((x) => this.canSeeTasks(u, x)).map((x) => x.id);
    const open = visible.length
      ? await this.prisma.task.findMany({
        where: { deletedAt: null, assigneeId: { in: visible }, status: { isDone: false } },
        select: { assigneeId: true, dueDate: true },
      })
      : [];
    const doneWeek = visible.length
      ? await this.prisma.task.groupBy({
        by: ['assigneeId'], _count: true,
        where: { deletedAt: null, assigneeId: { in: visible }, status: { isDone: true }, completedAt: { gte: monday } },
      })
      : [];
    const stats = new Map<number, { open: number; overdue: number; dueWeek: number; doneWeek: number }>();
    for (const id of visible) stats.set(id, { open: 0, overdue: 0, dueWeek: 0, doneWeek: 0 });
    for (const t of open) {
      const s = stats.get(t.assigneeId!)!;
      s.open++;
      if (t.dueDate && t.dueDate < today) s.overdue++;
      if (t.dueDate && t.dueDate >= today && t.dueDate < nextMonday) s.dueWeek++;
    }
    for (const d of doneWeek) if (d.assigneeId) stats.get(d.assigneeId)!.doneWeek = d._count;
    return {
      capacity,
      members: users.map(({ email, phone, lastLoginAt, ...x }) => ({
        ...x, email, isManager: x.department?.managerId === x.id, workload: stats.get(x.id) ?? null,
      })),
    };
  }

  @Get('team/:id')
  @UseGuards(AuthGuard)
  async profile(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const x = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userCard });
    if (!x) throw new NotFoundException('Kişi bulunamadı');
    const capacity = await this.settings.get<number>('report.workloadCapacity', 8);
    const { today, monday, nextMonday } = this.week();
    const self = u.id === id;
    const showTasks = this.canSeeTasks(u, x);

    const [openTasks, doneWeek, events, projects] = await Promise.all([
      showTasks
        ? this.prisma.task.findMany({
          where: { deletedAt: null, assigneeId: id, status: { isDone: false } },
          select: { id: true, title: true, dueDate: true, priority: true, project: { select: { id: true, name: true, color: true } } },
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
        })
        : null,
      showTasks ? this.prisma.task.count({ where: { deletedAt: null, assigneeId: id, status: { isDone: true }, completedAt: { gte: monday } } }) : null,
      // Bu haftaki etkinlikler: kendi profilimde hepsi; başkasında yalnızca benim de görebildiklerim
      this.prisma.calendarEvent.findMany({
        where: {
          deletedAt: null, startsAt: { gte: monday, lt: nextMonday },
          AND: [
            { OR: [{ ownerId: id }, { attendees: { some: { userId: id } } }] },
            ...(self ? [] : [{
              OR: [
                { visibility: 'company' }, { ownerId: u.id }, { attendees: { some: { userId: u.id } } },
                ...(u.departmentId && u.departmentId === x.departmentId ? [{ visibility: 'department' }] : []),
              ],
            }]),
          ],
        },
        select: { id: true, title: true, startsAt: true, endsAt: true, allDay: true },
        orderBy: { startsAt: 'asc' }, take: 8,
      }),
      this.prisma.project.findMany({
        where: {
          deletedAt: null, status: 'active',
          OR: [{ ownerId: id }, { members: { some: { userId: id } } }, { tasks: { some: { assigneeId: id, deletedAt: null } } }],
        },
        select: { id: true, name: true, color: true, ownerId: true, _count: { select: { tasks: { where: { deletedAt: null, status: { isDone: false } } } } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    const open = openTasks?.length ?? 0;
    return {
      ...x,
      self,
      isManager: x.department?.managerId === x.id,
      capacity,
      workload: openTasks
        ? {
          open, doneWeek,
          overdue: openTasks.filter((t) => t.dueDate && t.dueDate < today).length,
          dueWeek: openTasks.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate < nextMonday).length,
          load: Math.round((open / Math.max(1, capacity)) * 100),
        }
        : null,
      openTasks: openTasks?.slice(0, 8) ?? null,
      events,
      projects: projects.map(({ _count, ownerId, ...p }) => ({ ...p, role: ownerId === id ? 'Sahibi' : 'Üye', open: _count.tasks })),
    };
  }

  // ---------- Kendi hesabım ----------

  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    let uiPrefs: string | undefined;
    if (dto.ui) {
      // Gönderilen alanlar mevcut tercihlerle birleştirilir (yalnızca tema değişince duvar kâğıdı silinmesin).
      const cur = await this.prisma.user.findUnique({ where: { id: u.id }, select: { uiPrefs: true } });
      let prev: Record<string, string> = {};
      try { prev = cur?.uiPrefs ? JSON.parse(cur.uiPrefs) : {}; } catch { /* bozuk kayıt: sıfırdan */ }
      uiPrefs = JSON.stringify({ ...prev, ...Object.fromEntries(Object.entries(dto.ui).filter(([, v]) => v !== undefined)) });
    }
    await this.prisma.user.update({
      where: { id: u.id },
      data: {
        ...(dto.presence ? { presence: dto.presence, presenceAt: new Date() } : {}),
        ...(uiPrefs ? { uiPrefs } : {}),
      },
    });
    const r = await this.prisma.user.findUnique({ where: { id: u.id }, select: { phone: true, presence: true, presenceAt: true, uiPrefs: true } });
    return { ...r, uiPrefs: r?.uiPrefs ? JSON.parse(r.uiPrefs) : null };
  }

  @Post('me/avatar')
  @UseGuards(AuthGuard)
  async setAvatar(@CurrentUser() u: AuthUser, @Body() dto: AvatarDto) {
    const m = dto.dataUrl.match(/^data:image\/(webp|png|jpeg);base64,(.+)$/)!;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 700_000) throw new BadRequestException('Görsel çok büyük');
    // Dosya imzası türüyle uyuşmalı (yalnızca görsel kabul edilir)
    const sig = buf.subarray(0, 12).toString('latin1');
    const ok = m[1] === 'png' ? sig.startsWith('\x89PNG') : m[1] === 'jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 : sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP';
    if (!ok) throw new BadRequestException('Geçersiz görsel');
    await mkdir(AVATAR_DIR, { recursive: true });
    const file = `${u.id}-${randomBytes(8).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await writeFile(join(AVATAR_DIR, file), buf);
    const prev = await this.prisma.user.findUnique({ where: { id: u.id }, select: { avatarUrl: true } });
    const avatarUrl = `/api/avatars/${file}`;
    await this.prisma.user.update({ where: { id: u.id }, data: { avatarUrl } });
    await this.removeFile(prev?.avatarUrl);
    await this.audit.log(u.id, 'user.avatar', 'user', u.id);
    return { avatarUrl };
  }

  @Delete('me/avatar')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteAvatar(@CurrentUser() u: AuthUser) {
    const prev = await this.prisma.user.findUnique({ where: { id: u.id }, select: { avatarUrl: true } });
    await this.prisma.user.update({ where: { id: u.id }, data: { avatarUrl: null } });
    await this.removeFile(prev?.avatarUrl);
  }

  private async removeFile(url: string | null | undefined) {
    const name = url?.split('/').pop();
    if (name && AVATAR_FILE.test(name)) await unlink(join(AVATAR_DIR, name)).catch(() => undefined);
  }

  /**
   * Profil fotoğrafı. <img> istekleri jeton taşımadığı için oturumsuz sunulur;
   * dosya adı rastgele 16 haneli olduğundan tahmin edilemez ve yalnızca bu klasördeki görseller döner.
   */
  @Get('avatars/:file')
  avatar(@Param('file') file: string, @Res() res: Response) {
    const path = join(AVATAR_DIR, file);
    if (!AVATAR_FILE.test(file) || !existsSync(path)) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }
}
