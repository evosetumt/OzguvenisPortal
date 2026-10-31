import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CalendarService, CalendarItem } from '../calendar/calendar.service';
import type { AuthUser } from '../auth/auth.guard';
import { Scope, scopeOf, startOfTodayUtc } from '../common/scope';
import {
  RenewDto, TrackedItemDto, UpdateTrackedItemDto, UpdateVehicleDto, VehicleDto, VehicleServiceDto,
} from './tracking.dto';

const userSel = { select: { id: true, fullName: true } } as const;
const DAY = 86400000;

/** Tarih alanları gün olarak tutulur: "YYYY-MM-DD" → UTC gece yarısı. */
export const toDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const optDay = (s: string | null | undefined) => (s === undefined ? undefined : s === null ? null : toDay(s));
export const daysLeft = (end: Date, today = startOfTodayUtc()) => Math.round((end.getTime() - today.getTime()) / DAY);

/** Ay ekler; ay sonu taşmalarında ayın son gününe sabitlenir (31 Oca + 1 ay = 28/29 Şub). */
export function addMonths(d: Date, months: number) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}
const PERIOD_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12, biennial: 24 };

const csvIds = (ids?: number[] | null) => (ids && ids.length ? [...new Set(ids)].join(',') : null);
export const parseIds = (s: string | null) => (s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
/** "60,30,7,1" → [60,30,7,1] (tekil, büyükten küçüğe). */
export const parseDays = (s: string) => [...new Set(s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => b - a);
const normDays = (s?: string) => (s === undefined ? undefined : parseDays(s).join(','));

@Injectable()
export class TrackingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
    private readonly calendar: CalendarService,
  ) {}

  onModuleInit() {
    // Sözleşme/poliçe dosyalarını kaydı görebilen herkes açabilir.
    this.attachments.registerAccessCheck(async (u, attachmentId) => {
      const scope = scopeOf(u, 'tracking.read');
      if (!scope) return false;
      const n = await this.prisma.trackedItemAttachment.count({
        where: { attachmentId, trackedItem: { deletedAt: null, ...this.itemScopeWhere(u, scope) } },
      });
      return n > 0;
    });
    this.calendar.registerSource((u, from, to) => this.calendarItems(u, from, to));
  }

  // ---------- Kapsam ----------

  /** own: sahibi ben veya aracı bana zimmetli; department: sahibi departmanımda; all: hepsi. */
  itemScopeWhere(u: AuthUser, scope: Scope): Prisma.TrackedItemWhereInput {
    if (scope === 'all') return {};
    const or: Prisma.TrackedItemWhereInput[] = [{ ownerId: u.id }, { vehicle: { assignedUserId: u.id } }];
    if (scope === 'department' && u.departmentId) or.push({ owner: { departmentId: u.departmentId } });
    return { OR: or };
  }

  vehicleScopeWhere(u: AuthUser, scope: Scope): Prisma.VehicleWhereInput {
    if (scope === 'all') return {};
    const or: Prisma.VehicleWhereInput[] = [{ assignedUserId: u.id }, { trackedItems: { some: { ownerId: u.id, deletedAt: null } } }];
    if (scope === 'department' && u.departmentId) or.push({ assignedUser: { departmentId: u.departmentId } });
    return { OR: or };
  }

  private readScope(u: AuthUser) {
    const s = scopeOf(u, 'tracking.read');
    if (!s) throw new ForbiddenException();
    return s;
  }

  private writeScope(u: AuthUser) {
    const s = scopeOf(u, 'tracking.write');
    if (!s) throw new ForbiddenException('Süre takibi kaydı düzenleme yetkiniz yok');
    return s;
  }

  /** Sahip olarak atanabilecek kullanıcıyı kapsamla sınırlar (own: yalnız kendisi, department: aynı departman). */
  private async checkOwner(u: AuthUser, scope: Scope, ownerId: number) {
    if (scope === 'all' || ownerId === u.id) return;
    if (scope === 'department' && u.departmentId) {
      const owner = await this.prisma.user.findFirst({ where: { id: ownerId, deletedAt: null }, select: { departmentId: true } });
      if (owner?.departmentId === u.departmentId) return;
    }
    throw new ForbiddenException('Bu kişiyi sorumlu olarak atama yetkiniz yok');
  }

  private async checkVehicle(u: AuthUser, vehicleId: number | null | undefined) {
    if (!vehicleId) return;
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null, ...this.vehicleScopeWhere(u, this.readScope(u)) } });
    if (!v) throw new BadRequestException('Araç bulunamadı');
  }

  // ---------- Kayıtlar ----------

  async list(u: AuthUser, f: { category?: string; status?: string; q?: string; vehicleId?: number; within?: number }) {
    const scope = this.readScope(u);
    const where: Prisma.TrackedItemWhereInput = { deletedAt: null, ...this.itemScopeWhere(u, scope) };
    if (f.category) where.category = f.category;
    if (f.status) where.status = f.status;
    if (f.vehicleId) where.vehicleId = f.vehicleId;
    if (f.within !== undefined) where.endDate = { lte: new Date(startOfTodayUtc().getTime() + f.within * DAY) };
    if (f.q) where.AND = [{ OR: [{ title: { contains: f.q } }, { counterparty: { contains: f.q } }, { vehicle: { plate: { contains: f.q } } }] }];
    const items = await this.prisma.trackedItem.findMany({
      where,
      include: { owner: userSel, vehicle: { select: { id: true, plate: true } }, _count: { select: { files: true } } },
      orderBy: { endDate: 'asc' },
      take: 500,
    });
    const today = startOfTodayUtc();
    return items.map(({ _count, ...i }) => ({ ...i, daysLeft: daysLeft(i.endDate, today), fileCount: _count.files }));
  }

  async summary(u: AuthUser) {
    const scope = this.readScope(u);
    const base: Prisma.TrackedItemWhereInput = { deletedAt: null, status: 'active', ...this.itemScopeWhere(u, scope) };
    const today = startOfTodayUtc();
    const [active, in30, in7, expired] = await Promise.all([
      this.prisma.trackedItem.count({ where: base }),
      this.prisma.trackedItem.count({ where: { ...base, endDate: { lte: new Date(today.getTime() + 30 * DAY) } } }),
      this.prisma.trackedItem.count({ where: { ...base, endDate: { lte: new Date(today.getTime() + 7 * DAY) } } }),
      this.prisma.trackedItem.count({ where: { deletedAt: null, status: 'expired', ...this.itemScopeWhere(u, scope) } }),
    ]);
    return { active, in30, in7, expired };
  }

  private async findVisible(u: AuthUser, id: number) {
    const item = await this.prisma.trackedItem.findFirst({ where: { id, deletedAt: null, ...this.itemScopeWhere(u, this.readScope(u)) } });
    if (!item) throw new NotFoundException('Kayıt bulunamadı');
    return item;
  }

  /** Düzenleme: yazma kapsamı okuma kapsamından dar olabilir. */
  private async findEditable(u: AuthUser, id: number) {
    const scope = this.writeScope(u);
    const item = await this.prisma.trackedItem.findFirst({ where: { id, deletedAt: null, ...this.itemScopeWhere(u, scope) } });
    if (!item) {
      await this.findVisible(u, id); // görünmüyorsa 404
      throw new ForbiddenException('Bu kaydı düzenleme yetkiniz yok');
    }
    return { item, scope };
  }

  async get(u: AuthUser, id: number) {
    await this.findVisible(u, id);
    const i = await this.prisma.trackedItem.findUniqueOrThrow({
      where: { id },
      include: {
        owner: userSel,
        vehicle: { select: { id: true, plate: true, brandModel: true } },
        files: { include: { attachment: { select: { id: true, fileName: true, mime: true, size: true, createdAt: true } } } },
        reminders: { orderBy: { sentAt: 'desc' }, take: 20 },
      },
    });
    const notifyIds = parseIds(i.notifyUserIds);
    const notifyUsers = notifyIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: notifyIds } }, select: { id: true, fullName: true } })
      : [];
    const ws = scopeOf(u, 'tracking.write');
    const canEdit = !!ws && (await this.prisma.trackedItem.count({ where: { id, ...this.itemScopeWhere(u, ws) } })) > 0;
    const { files, ...rest } = i;
    return { ...rest, files: files.map((f) => f.attachment), notifyUsers, daysLeft: daysLeft(i.endDate), canEdit };
  }

  async create(u: AuthUser, dto: TrackedItemDto) {
    const scope = this.writeScope(u);
    const ownerId = dto.ownerId ?? u.id;
    await this.checkOwner(u, scope, ownerId);
    await this.checkVehicle(u, dto.vehicleId);
    const startDate = optDay(dto.startDate);
    const endDate = toDay(dto.endDate);
    if (startDate && startDate > endDate) throw new BadRequestException('Başlangıç, bitişten sonra olamaz');
    const attachmentIds = await this.ownAttachments(u, dto.attachmentIds);
    const item = await this.prisma.trackedItem.create({
      data: {
        category: dto.category,
        title: dto.title.trim(),
        counterparty: dto.counterparty,
        vehicleId: dto.vehicleId ?? null,
        startDate,
        endDate,
        amount: dto.amount ?? null,
        currency: dto.currency ?? 'TRY',
        renewalPeriod: dto.renewalPeriod ?? 'none',
        ownerId,
        reminderDays: normDays(dto.reminderDays) ?? '60,30,7,1',
        notifyUserIds: csvIds(dto.notifyUserIds),
        notes: dto.notes,
        status: endDate < startOfTodayUtc() ? 'expired' : 'active',
        files: { create: attachmentIds.map((attachmentId) => ({ attachmentId })) },
      },
    });
    await this.audit.log(u.id, 'tracking.create', 'tracked_item', item.id, dto);
    return this.get(u, item.id);
  }

  /** Yalnızca kullanıcının kendi yüklediği dosyalar yeni kayda bağlanabilir. */
  private async ownAttachments(u: AuthUser, ids?: number[]) {
    if (!ids?.length) return [];
    const rows = await this.prisma.attachment.findMany({ where: { id: { in: ids }, uploadedById: u.id }, select: { id: true } });
    if (rows.length !== new Set(ids).size) throw new BadRequestException('Dosya bulunamadı');
    return rows.map((r) => r.id);
  }

  async update(u: AuthUser, id: number, dto: UpdateTrackedItemDto) {
    const { item, scope } = await this.findEditable(u, id);
    if (dto.ownerId !== undefined && dto.ownerId !== item.ownerId) await this.checkOwner(u, scope, dto.ownerId);
    if (dto.vehicleId) await this.checkVehicle(u, dto.vehicleId);
    const startDate = optDay(dto.startDate);
    const endDate = dto.endDate ? toDay(dto.endDate) : undefined;
    const s = startDate === undefined ? item.startDate : startDate;
    const e = endDate ?? item.endDate;
    if (s && s > e) throw new BadRequestException('Başlangıç, bitişten sonra olamaz');
    let status = dto.status;
    // Süresi geçmiş kaydın bitişi ileri alınırsa yeniden aktifleşir.
    if (!status && endDate && item.status === 'expired' && endDate >= startOfTodayUtc()) status = 'active';
    await this.prisma.trackedItem.update({
      where: { id },
      data: {
        category: dto.category,
        title: dto.title?.trim(),
        counterparty: dto.counterparty,
        vehicleId: dto.vehicleId,
        startDate,
        endDate,
        amount: dto.amount,
        currency: dto.currency,
        renewalPeriod: dto.renewalPeriod,
        ownerId: dto.ownerId,
        status,
        reminderDays: normDays(dto.reminderDays),
        notifyUserIds: dto.notifyUserIds === undefined ? undefined : csvIds(dto.notifyUserIds),
        notes: dto.notes,
      },
    });
    await this.audit.log(u.id, 'tracking.update', 'tracked_item', id, dto);
    return this.get(u, id);
  }

  async remove(u: AuthUser, id: number) {
    await this.findEditable(u, id);
    await this.prisma.trackedItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(u.id, 'tracking.delete', 'tracked_item', id);
  }

  /** Bir sonraki dönemi yeni kayıt olarak açar, eskisini "yenilendi" yapar. */
  async renew(u: AuthUser, id: number, dto: RenewDto) {
    const { item } = await this.findEditable(u, id);
    if (item.status === 'renewed') throw new ConflictException('Bu kayıt zaten yenilenmiş');
    const months = PERIOD_MONTHS[item.renewalPeriod ?? 'none'];
    const endDate = dto.endDate ? toDay(dto.endDate) : months ? addMonths(item.endDate, months) : null;
    if (!endDate) throw new BadRequestException('Yenileme periyodu yok; yeni bitiş tarihini girin');
    if (endDate <= item.endDate) throw new BadRequestException('Yeni bitiş, eski bitişten sonra olmalı');
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.trackedItem.update({ where: { id }, data: { status: 'renewed' } });
      return tx.trackedItem.create({
        data: {
          category: item.category,
          title: item.title,
          counterparty: item.counterparty,
          vehicleId: item.vehicleId,
          startDate: item.endDate,
          endDate,
          amount: dto.amount === undefined ? item.amount : dto.amount,
          currency: item.currency,
          renewalPeriod: item.renewalPeriod,
          ownerId: item.ownerId,
          reminderDays: item.reminderDays,
          notifyUserIds: item.notifyUserIds,
          notes: dto.notes === undefined ? item.notes : dto.notes,
          status: endDate < startOfTodayUtc() ? 'expired' : 'active',
        },
      });
    });
    await this.audit.log(u.id, 'tracking.renew', 'tracked_item', id, { nextId: next.id, endDate });
    return this.get(u, next.id);
  }

  async attachFile(u: AuthUser, id: number, attachmentId: number) {
    await this.findEditable(u, id);
    await this.ownAttachments(u, [attachmentId]);
    await this.prisma.trackedItemAttachment.upsert({
      where: { trackedItemId_attachmentId: { trackedItemId: id, attachmentId } },
      update: {},
      create: { trackedItemId: id, attachmentId },
    });
    await this.audit.log(u.id, 'tracking.file_add', 'tracked_item', id, { attachmentId });
    return this.get(u, id);
  }

  async detachFile(u: AuthUser, id: number, attachmentId: number) {
    await this.findEditable(u, id);
    await this.prisma.trackedItemAttachment.deleteMany({ where: { trackedItemId: id, attachmentId } });
    await this.audit.log(u.id, 'tracking.file_remove', 'tracked_item', id, { attachmentId });
  }

  // ---------- Araçlar ----------

  async vehicles(u: AuthUser) {
    const scope = this.readScope(u);
    const today = startOfTodayUtc();
    const rows = await this.prisma.vehicle.findMany({
      where: { deletedAt: null, ...this.vehicleScopeWhere(u, scope) },
      include: {
        assignedUser: userSel,
        services: { orderBy: { date: 'desc' }, take: 1 },
        trackedItems: {
          where: { deletedAt: null, status: { in: ['active', 'expired'] } },
          select: { id: true, category: true, endDate: true },
          orderBy: { endDate: 'asc' },
        },
      },
      orderBy: { plate: 'asc' },
    });
    return rows.map(({ services, trackedItems, ...v }) => {
      const next = trackedItems[0];
      return {
        ...v,
        lastService: services[0] ?? null,
        nextDue: next ? { itemId: next.id, category: next.category, endDate: next.endDate, daysLeft: daysLeft(next.endDate, today) } : null,
        itemCount: trackedItems.length,
      };
    });
  }

  private async findVehicle(u: AuthUser, id: number, write = false) {
    const scope = write ? this.writeScope(u) : this.readScope(u);
    const v = await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null, ...this.vehicleScopeWhere(u, scope) } });
    if (!v) {
      if (write && (await this.prisma.vehicle.count({ where: { id, deletedAt: null, ...this.vehicleScopeWhere(u, this.readScope(u)) } }))) {
        throw new ForbiddenException('Bu aracı düzenleme yetkiniz yok');
      }
      throw new NotFoundException('Araç bulunamadı');
    }
    return v;
  }

  async vehicle(u: AuthUser, id: number) {
    await this.findVehicle(u, id);
    const v = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id },
      include: { assignedUser: userSel, services: { orderBy: { date: 'desc' } } },
    });
    const scope = this.readScope(u);
    const items = await this.prisma.trackedItem.findMany({
      where: { vehicleId: id, deletedAt: null, ...this.itemScopeWhere(u, scope) },
      select: { id: true, category: true, title: true, endDate: true, status: true },
      orderBy: { endDate: 'desc' },
    });
    const ws = scopeOf(u, 'tracking.write');
    const canEdit = !!ws && (await this.prisma.vehicle.count({ where: { id, ...this.vehicleScopeWhere(u, ws) } })) > 0;
    const today = startOfTodayUtc();
    return { ...v, items: items.map((i) => ({ ...i, daysLeft: daysLeft(i.endDate, today) })), canEdit };
  }

  private normPlate(p: string) {
    return p.toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
  }

  async createVehicle(u: AuthUser, dto: VehicleDto) {
    const scope = this.writeScope(u);
    if (dto.assignedUserId) await this.checkOwner(u, scope, dto.assignedUserId);
    else if (scope === 'own') throw new BadRequestException('Aracı kendinize zimmetlemelisiniz');
    const plate = this.normPlate(dto.plate);
    if (await this.prisma.vehicle.findFirst({ where: { plate } })) throw new ConflictException('Bu plaka zaten kayıtlı');
    const v = await this.prisma.vehicle.create({
      data: { plate, brandModel: dto.brandModel, year: dto.year, assignedUserId: dto.assignedUserId ?? null, km: dto.km, notes: dto.notes },
    });
    await this.audit.log(u.id, 'vehicle.create', 'vehicle', v.id, dto);
    return this.vehicle(u, v.id);
  }

  async updateVehicle(u: AuthUser, id: number, dto: UpdateVehicleDto) {
    const v = await this.findVehicle(u, id, true);
    const scope = this.writeScope(u);
    if (dto.assignedUserId && dto.assignedUserId !== v.assignedUserId) await this.checkOwner(u, scope, dto.assignedUserId);
    const plate = dto.plate ? this.normPlate(dto.plate) : undefined;
    if (plate && plate !== v.plate && (await this.prisma.vehicle.findFirst({ where: { plate } }))) throw new ConflictException('Bu plaka zaten kayıtlı');
    await this.prisma.vehicle.update({
      where: { id },
      data: { plate, brandModel: dto.brandModel, year: dto.year, assignedUserId: dto.assignedUserId, km: dto.km, notes: dto.notes },
    });
    await this.audit.log(u.id, 'vehicle.update', 'vehicle', id, dto);
    return this.vehicle(u, id);
  }

  async removeVehicle(u: AuthUser, id: number) {
    await this.findVehicle(u, id, true);
    // Plaka tekil olduğundan silinen aracın plakası serbest bırakılır.
    await this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), plate: `silindi-${id}` } });
    await this.audit.log(u.id, 'vehicle.delete', 'vehicle', id);
  }

  async addService(u: AuthUser, vehicleId: number, dto: VehicleServiceDto) {
    const v = await this.findVehicle(u, vehicleId, true);
    const s = await this.prisma.vehicleService.create({
      data: {
        vehicleId,
        type: dto.type.trim(),
        date: toDay(dto.date),
        km: dto.km,
        cost: dto.cost,
        nextDueDate: optDay(dto.nextDueDate),
        nextDueKm: dto.nextDueKm,
        notes: dto.notes,
      },
    });
    // Servis kaydındaki km aracın güncel km'sinden büyükse araç km'si güncellenir.
    if (dto.km && (!v.km || dto.km > v.km)) await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { km: dto.km } });
    await this.audit.log(u.id, 'vehicle.service_add', 'vehicle', vehicleId, dto);
    return s;
  }

  async removeService(u: AuthUser, serviceId: number) {
    const s = await this.prisma.vehicleService.findUnique({ where: { id: serviceId } });
    if (!s) throw new NotFoundException('Servis kaydı bulunamadı');
    await this.findVehicle(u, s.vehicleId, true);
    await this.prisma.vehicleService.delete({ where: { id: serviceId } });
    await this.audit.log(u.id, 'vehicle.service_delete', 'vehicle', s.vehicleId, { serviceId });
  }

  // ---------- Takvim ----------

  private async calendarItems(u: AuthUser, from: Date, to: Date): Promise<CalendarItem[]> {
    const scope = scopeOf(u, 'tracking.read');
    if (!scope) return [];
    const items = await this.prisma.trackedItem.findMany({
      where: { deletedAt: null, status: { in: ['active', 'expired'] }, endDate: { gte: from, lt: to }, ...this.itemScopeWhere(u, scope) },
      select: { id: true, title: true, endDate: true, vehicle: { select: { plate: true } } },
    });
    const services = await this.prisma.vehicleService.findMany({
      where: { nextDueDate: { gte: from, lt: to }, vehicle: { deletedAt: null, ...this.vehicleScopeWhere(u, scope) } },
      select: { id: true, type: true, nextDueDate: true, vehicleId: true, vehicle: { select: { plate: true } } },
    });
    return [
      ...items.map((i) => ({
        key: `tracking-${i.id}`,
        kind: 'tracking',
        id: i.id,
        title: `Bitiş: ${i.title}${i.vehicle ? ` (${i.vehicle.plate})` : ''}`,
        start: i.endDate,
        end: i.endDate,
        allDay: true,
        color: '#f59e0b',
        link: `/tracking?id=${i.id}`,
      })),
      ...services.map((s) => ({
        key: `vehicle-service-${s.id}`,
        kind: 'tracking',
        id: s.id,
        title: `${s.vehicle.plate}: ${s.type}`,
        start: s.nextDueDate!,
        end: s.nextDueDate!,
        allDay: true,
        color: '#f59e0b',
        link: `/tracking?tab=vehicles&vehicle=${s.vehicleId}`,
      })),
    ];
  }
}
