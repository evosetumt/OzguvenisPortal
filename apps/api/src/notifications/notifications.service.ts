import { Injectable, OnModuleInit } from '@nestjs/common';
import { fmtDateTr } from '../common/format';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService, PortalEvent } from '../events/events.service';

/** Dış kanallarda bildirimin nasıl teslim edileceği; uygulama içi kayda yazılmaz. Kanallar türe bakmadan bunu uygular. */
export interface Delivery {
  /** WhatsApp şablon değişkenleri ({{1}}, {{2}} ...). Yoksa [başlık, metin] kullanılır. */
  params?: string[];
  /** Push grup etiketi: aynı etiketli yeni bildirim öncekinin yerine geçer (örn. call-12). */
  tag?: string;
  /** Hemen iletilir, kısa ömürlüdür (gelen arama). */
  urgent?: boolean;
  /** Kullanıcı dokunana kadar ekranda kalır, uzun titreşir. */
  sticky?: boolean;
  /** Bildirim göstermez; aynı etiketli bildirimi kapatır (yalnız tarayıcılar). */
  close?: boolean;
  /** Bildirimdeki açma düğmesinin yazısı (örn. "Görevi aç", "Cevapla"). */
  openLabel?: string;
}

export interface NewNotification { type: string; title: string; body?: string; link?: string; delivery?: Delivery }

/** Uygulama içi dışındaki kanallar (push, email, whatsapp) bu arayüzle kaydolur. */
export interface ChannelSender {
  /** Kanal yapılandırılmamışsa false döner; bildirim "skipped" olarak kaydedilir. */
  isConfigured(): boolean;
  send(userId: number, n: NewNotification & { id?: number }): Promise<void>;
}

export const CHANNELS = ['inapp', 'push', 'email', 'whatsapp'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Olay → alıcılar ve metin. Hangi olayın hangi kanallardan gideceği notification_rules tablosundan okunur. */
type RuleResult = { userIds: number[]; n: NewNotification } | null;
type Rule = (e: PortalEvent<any>, db: PrismaService) => RuleResult | Promise<RuleResult>;

export interface RuleDef { label: string; rule: Rule; defaultChannels?: Channel[] }

const fmtDate = (d: string | Date) => fmtDateTr(d, { year: false });

const CORE_RULES: Record<string, RuleDef> = {
  'task.assigned': {
    label: 'Görev atandı',
    defaultChannels: ['inapp', 'push', 'email', 'whatsapp'],
    rule: async ({ payload: p, actorId }, db) => {
      const [task, actor] = await Promise.all([
        db.task.findUnique({ where: { id: p.taskId }, select: { dueDate: true } }),
        actorId ? db.user.findUnique({ where: { id: actorId }, select: { fullName: true } }) : null,
      ]);
      const by = actor?.fullName ?? 'Sistem';
      const due = task?.dueDate ? fmtDate(task.dueDate) : 'Belirtilmedi';
      return {
        userIds: [p.assigneeId],
        n: {
          type: 'task.assigned', title: 'Size görev atandı', body: `${p.title} · Atayan: ${by} · Bitiş: ${due}`,
          link: `/tasks?id=${p.taskId}`, delivery: { params: [p.title, by, due], openLabel: 'Görevi aç' },
        },
      };
    },
  },
  'task.commented': {
    label: 'Göreve not/yorum eklendi',
    defaultChannels: ['email'],
    rule: ({ payload: p }) => ({
      userIds: p.recipientIds,
      n: { type: 'task.commented', title: `${p.authorName} yorum yaptı`, body: `${p.title}: ${p.excerpt}`, link: `/tasks?id=${p.taskId}` },
    }),
  },
  'task.completed': {
    label: 'Görev tamamlandı',
    defaultChannels: ['inapp', 'push', 'email', 'whatsapp'],
    // Görevi açan ve takip edenler; tamamlayan kişi kendi eylemi için almaz.
    rule: async ({ payload: p, actorId }, db) => {
      const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { fullName: true } }) : null;
      const by = actor?.fullName ?? 'Sistem';
      return {
        userIds: p.recipientIds ?? [p.createdById],
        n: {
          type: 'task.completed', title: 'Görev tamamlandı', body: `${p.title} · Tamamlayan: ${by}`,
          link: `/tasks?id=${p.taskId}`, delivery: { params: [p.title, by], openLabel: 'Görevi aç' },
        },
      };
    },
  },
  'task.subtask_done': {
    label: 'Alt görev tamamlandı',
    defaultChannels: ['email'],
    rule: ({ payload: p }) => ({
      userIds: p.recipientIds,
      n: { type: 'task.subtask_done', title: `${p.actorName} alt görevi tamamladı`, body: `${p.title}: ${p.subtask}`, link: `/tasks?id=${p.taskId}` },
    }),
  },
  'task.due_soon': {
    label: 'Görev bitiş tarihi yaklaşıyor',
    defaultChannels: ['inapp', 'push'],
    rule: ({ payload: p }) => ({
      userIds: [p.assigneeId],
      n: { type: 'task.due_soon', title: 'Görevin bitiş tarihi yaklaşıyor', body: `${p.title} · ${fmtDate(p.dueDate)}`, link: `/tasks?id=${p.taskId}` },
    }),
  },
  'calendar.invited': {
    label: 'Takvim daveti',
    rule: ({ payload: p }) => ({
      userIds: p.userIds,
      n: { type: 'calendar.invited', title: 'Etkinliğe davet edildiniz', body: `${p.title} · ${fmtDate(p.startsAt)}`, link: '/calendar' },
    }),
  },
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly rules = new Map<string, RuleDef>();
  private readonly senders = new Map<Channel, ChannelSender>();
  /** notification_rules önbelleği: eventCode → {channels, isActive}; kural değişince temizlenir. */
  private ruleCache: Map<string, { channels: Channel[]; isActive: boolean }> | null = null;

  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  onModuleInit() {
    for (const [code, def] of Object.entries(CORE_RULES)) this.registerRule(code, def);
  }

  /** Modüller kendi olayları için bildirim kuralı ekler (örn. order.created, expense.submitted). */
  registerRule(code: string, def: RuleDef) {
    if (this.rules.has(code)) return;
    this.rules.set(code, def);
    this.events.on(code, async (e) => {
      const r = await def.rule(e, this.prisma);
      if (!r) return;
      // Kişi kendi eylemi için bildirim almaz.
      const ids = [...new Set(r.userIds.filter((id) => id && id !== e.actorId))];
      await this.send(ids, r.n, code);
    });
  }

  registerChannel(channel: Exclude<Channel, 'inapp'>, sender: ChannelSender) {
    this.senders.set(channel, sender);
  }

  /** Kayıtlı kurallar ve tablodaki ayarları (yönetim ekranı için). */
  async listRules() {
    const rows = await this.prisma.notificationRule.findMany();
    const byCode = new Map(rows.map((r) => [r.eventCode, r]));
    return [...this.rules.entries()].map(([code, def]) => {
      const row = byCode.get(code);
      return {
        eventCode: code,
        label: def.label,
        channels: row ? splitChannels(row.channels) : def.defaultChannels ?? ['inapp'],
        isActive: row?.isActive ?? true,
      };
    });
  }

  async saveRule(eventCode: string, channels: Channel[], isActive: boolean) {
    const def = this.rules.get(eventCode);
    if (!def) return null;
    const data = { channels: channels.join(','), isActive, label: def.label };
    await this.prisma.notificationRule.upsert({ where: { eventCode }, update: data, create: { eventCode, ...data } });
    this.ruleCache = null;
    return { eventCode, ...data, channels };
  }

  availableChannels() {
    return CHANNELS.map((c) => ({ channel: c, configured: c === 'inapp' || !!this.senders.get(c)?.isConfigured() }));
  }

  private async ruleSettings(code: string) {
    if (!this.ruleCache) {
      const rows = await this.prisma.notificationRule.findMany();
      this.ruleCache = new Map(rows.map((r) => [r.eventCode, { channels: splitChannels(r.channels), isActive: r.isActive }]));
    }
    return this.ruleCache.get(code) ?? { channels: this.rules.get(code)?.defaultChannels ?? ['inapp'], isActive: true };
  }

  /**
   * Bildirimi kuralın kanallarına gönderir. Kullanıcı tercihi (user_notification_prefs) varsa kanallar onunla kesişir.
   * Uygulama içi kayıt her zaman oluşturulur (kural pasif değilse); diğer kanallar en iyi çabayla gider ve sonucu loglanır.
   */
  async send(userIds: number[], n: NewNotification, eventCode = n.type) {
    if (!userIds.length) return;
    const setting = await this.ruleSettings(eventCode);
    if (!setting.isActive) return;
    const prefs = await this.prisma.userNotificationPref.findMany({ where: { eventCode, userId: { in: userIds } } });
    const prefBy = new Map(prefs.map((p) => [p.userId, new Set(splitChannels(p.channels))]));

    // Alıcılar birbirini beklemez (her biri dış kanallara HTTP isteği atar).
    await Promise.all(userIds.map((userId) => {
      const pref = prefBy.get(userId);
      return this.deliver(userId, n, setting.channels.filter((c) => !pref || pref.has(c)));
    }));
  }

  /** Tek kullanıcıya verilen kanallardan gönderir; dış kanalların sonucunu bekler ve döner (test için). */
  async deliver(userId: number, n: NewNotification, channels: Channel[]) {
    let id: number | undefined;
    if (channels.includes('inapp')) {
      const { delivery: _delivery, ...data } = n;
      const row = await this.prisma.notification.create({ data: { userId, ...data } });
      id = row.id;
      this.events.emit('notification.created', null, { userId, notification: row });
    }
    const results: { channel: Channel; status: string; error?: string }[] = [];
    const jobs = channels.filter((c) => c !== 'inapp').map(async (c) => {
      const sender = this.senders.get(c);
      if (!sender?.isConfigured()) {
        results.push({ channel: c, status: 'skipped', error: 'Kanal yapılandırılmamış' });
        return this.logDelivery(id, userId, c, 'skipped', 'Kanal yapılandırılmamış');
      }
      try {
        await sender.send(userId, { ...n, id });
        results.push({ channel: c, status: 'sent' });
        await this.logDelivery(id, userId, c, 'sent');
      } catch (err: any) {
        const error = String(err?.message ?? err).slice(0, 1000);
        results.push({ channel: c, status: 'failed', error });
        await this.logDelivery(id, userId, c, 'failed', error);
      }
    });
    await Promise.all(jobs);
    return results;
  }

  /** Kullanıcının olay bazında kanal tercihleri; seçilebilecek kanallar kuralın kanallarıyla sınırlıdır. */
  async getPrefs(userId: number) {
    const [rules, prefs] = await Promise.all([
      this.listRules(),
      this.prisma.userNotificationPref.findMany({ where: { userId } }),
    ]);
    const byCode = new Map(prefs.map((p) => [p.eventCode, splitChannels(p.channels)]));
    return rules
      .filter((r) => r.isActive)
      .map((r) => ({ eventCode: r.eventCode, label: r.label, available: r.channels, channels: byCode.get(r.eventCode) ?? r.channels }));
  }

  async savePrefs(userId: number, items: { eventCode: string; channels: string[] }[]) {
    const rules = new Map((await this.listRules()).map((r) => [r.eventCode, r]));
    for (const it of items) {
      const rule = rules.get(it.eventCode);
      if (!rule) continue;
      const channels = rule.channels.filter((c) => it.channels.includes(c));
      // Kuralın tüm kanalları seçiliyse tercih kaydı tutma (kural değişince otomatik izlesin).
      if (channels.length === rule.channels.length) {
        await this.prisma.userNotificationPref.deleteMany({ where: { userId, eventCode: it.eventCode } });
      } else {
        await this.prisma.userNotificationPref.upsert({
          where: { userId_eventCode: { userId, eventCode: it.eventCode } },
          update: { channels: channels.join(',') },
          create: { userId, eventCode: it.eventCode, channels: channels.join(',') },
        });
      }
    }
    return this.getPrefs(userId);
  }

  private async logDelivery(notificationId: number | undefined, userId: number, channel: string, status: string, error?: string) {
    try {
      await this.prisma.notificationDelivery.create({ data: { notificationId, userId, channel, status, error } });
    } catch (e) {
      console.error('Bildirim teslim kaydı yazılamadı', e);
    }
  }

  list(userId: number, unreadOnly: boolean, take = 30) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  unreadCount(userId: number) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: number, id?: number) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
  }
}

const splitChannels = (s: string) => s.split(',').map((x) => x.trim()).filter((x): x is Channel => (CHANNELS as readonly string[]).includes(x));
