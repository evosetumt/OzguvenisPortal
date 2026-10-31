import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { fmtDateTr as fmtDate } from '../common/format';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { startOfTodayUtc } from '../common/scope';
import { daysLeft, parseDays, parseIds } from './tracking.service';

const HOUR = 3600000;
const leftText = (n: number) => (n === 0 ? 'bugün bitiyor' : `${n} gün kaldı`);

/**
 * Süre takibi hatırlatmaları. Açılışta ve saatte bir çalışır; aynı kayıt, aynı bitiş tarihi ve aynı gün eşiği için
 * TrackedItemReminder'daki tekil kısıt sayesinde birden fazla sunucu/çalıştırmada bile yalnızca bir kez gönderir.
 */
@Injectable()
export class TrackingReminderService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    const channels = ['inapp', 'push', 'email'] as const;
    this.notifications.registerRule('tracked_item.expiring', {
      label: 'Süre takibi: bitiş yaklaşıyor',
      defaultChannels: [...channels],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'tracked_item.expiring', title: `Süre doluyor: ${p.title}`, body: `${leftText(p.daysLeft)} · ${fmtDate(p.endDate)}`, link: `/tracking?id=${p.itemId}` },
      }),
    });
    this.notifications.registerRule('tracked_item.expired', {
      label: 'Süre takibi: süresi doldu',
      defaultChannels: [...channels],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'tracked_item.expired', title: `Süresi doldu: ${p.title}`, body: `Bitiş: ${fmtDate(p.endDate)}`, link: `/tracking?id=${p.itemId}` },
      }),
    });
    this.notifications.registerRule('vehicle.service_due', {
      label: 'Araç bakımı yaklaşıyor',
      defaultChannels: [...channels],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'vehicle.service_due', title: `${p.plate}: ${p.type} zamanı`, body: `${leftText(p.daysLeft)} · ${fmtDate(p.dueDate)}`, link: `/tracking?tab=vehicles&vehicle=${p.vehicleId}` },
      }),
    });

    if (process.env.TRACKING_REMINDERS === 'off') return;
    this.first = setTimeout(() => void this.run(), 15000);
    this.timer = setInterval(() => void this.run(), HOUR);
  }

  onModuleDestroy() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** Tek çalıştırma; test ve elle tetikleme için de kullanılır. */
  async run() {
    if (this.running) return { expiring: 0, expired: 0, services: 0 };
    this.running = true;
    try {
      const today = startOfTodayUtc();
      return {
        expired: await this.markExpired(today),
        expiring: await this.remindExpiring(today),
        services: await this.remindServices(today),
      };
    } catch (e) {
      console.error('Süre takibi hatırlatma hatası', e);
      return { expiring: 0, expired: 0, services: 0 };
    } finally {
      this.running = false;
    }
  }

  private async recipients(item: { ownerId: number; notifyUserIds: string | null; vehicle: { assignedUserId: number | null } | null }) {
    const ids = [item.ownerId, ...parseIds(item.notifyUserIds)];
    if (item.vehicle?.assignedUserId) ids.push(item.vehicle.assignedUserId);
    const active = await this.prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null, status: 'active' }, select: { id: true } });
    return active.map((u) => u.id);
  }

  private async markExpired(today: Date) {
    const items = await this.prisma.trackedItem.findMany({
      where: { deletedAt: null, status: 'active', endDate: { lt: today } },
      include: { vehicle: { select: { assignedUserId: true } } },
    });
    let n = 0;
    for (const i of items) {
      // Koşullu güncelleme: başka bir süreç aynı anda işaretlediyse olay tekrar üretilmez.
      const r = await this.prisma.trackedItem.updateMany({ where: { id: i.id, status: 'active' }, data: { status: 'expired' } });
      if (!r.count) continue;
      n++;
      this.events.emit('tracked_item.expired', null, { itemId: i.id, title: i.title, endDate: i.endDate, userIds: await this.recipients(i) });
    }
    return n;
  }

  /**
   * Kalan gün, eşiklerden birinin altına indiğinde yalnızca en küçük uygun eşik için gönderilir
   * (5 gün kalan ve eşikleri 60,30,7,1 olan kayıt için yalnız "7" gönderilir; 60 ve 30 atlanır).
   */
  private async remindExpiring(today: Date) {
    const maxDays = Math.max(60, ...(await this.prisma.trackedItem.findMany({
      where: { deletedAt: null, status: 'active', endDate: { gte: today } },
      select: { reminderDays: true },
      distinct: ['reminderDays'],
    })).flatMap((r) => parseDays(r.reminderDays)));
    const items = await this.prisma.trackedItem.findMany({
      where: { deletedAt: null, status: 'active', endDate: { gte: today, lte: new Date(today.getTime() + maxDays * 86400000) } },
      include: { vehicle: { select: { assignedUserId: true } } },
    });
    let n = 0;
    for (const i of items) {
      const left = daysLeft(i.endDate, today);
      const due = parseDays(i.reminderDays).filter((d) => d >= left);
      if (!due.length) continue;
      const threshold = Math.min(...due);
      try {
        await this.prisma.trackedItemReminder.create({ data: { trackedItemId: i.id, daysBefore: threshold, forEndDate: i.endDate } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // zaten gönderildi
        throw e;
      }
      n++;
      this.events.emit('tracked_item.expiring', null, {
        itemId: i.id, title: i.title, endDate: i.endDate, daysLeft: left, threshold, userIds: await this.recipients(i),
      });
    }
    return n;
  }

  /** Aracın en son servis kaydındaki "sonraki bakım" tarihi yaklaşınca bir kez uyarır (gönderim audit_logs'a işlenir). */
  private async remindServices(today: Date) {
    const days = await this.settings.get<number>('tracking.vehicleServiceReminderDays', 7);
    const services = await this.prisma.vehicleService.findMany({
      where: {
        nextDueDate: { gte: today, lte: new Date(today.getTime() + days * 86400000) },
        vehicle: { deletedAt: null },
      },
      include: { vehicle: { select: { id: true, plate: true, assignedUserId: true } } },
    });
    let n = 0;
    for (const s of services) {
      const newer = await this.prisma.vehicleService.count({ where: { vehicleId: s.vehicleId, date: { gt: s.date } } });
      if (newer) continue; // daha yeni bir servis kaydı bu planı geçersiz kılar
      const sent = await this.prisma.auditLog.count({ where: { action: 'vehicle.service_reminder', entity: 'vehicle_service', entityId: String(s.id) } });
      if (sent) continue;
      await this.prisma.auditLog.create({ data: { action: 'vehicle.service_reminder', entity: 'vehicle_service', entityId: String(s.id) } });
      const userIds = s.vehicle.assignedUserId ? [s.vehicle.assignedUserId] : [];
      // Zimmetli kişi yoksa araç kayıtlarının sahiplerine gider.
      if (!userIds.length) {
        const owners = await this.prisma.trackedItem.findMany({ where: { vehicleId: s.vehicleId, deletedAt: null }, select: { ownerId: true }, distinct: ['ownerId'] });
        userIds.push(...owners.map((o) => o.ownerId));
      }
      n++;
      this.events.emit('vehicle.service_due', null, {
        vehicleId: s.vehicleId, plate: s.vehicle.plate, type: s.type, dueDate: s.nextDueDate, daysLeft: daysLeft(s.nextDueDate!, today), userIds,
      });
    }
    return n;
  }
}
