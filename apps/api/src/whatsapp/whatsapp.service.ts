import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TemplateDef, WhatsappClient, waConfig } from './whatsapp.client';

const OPT_OUT_WORDS = new Set(['STOP', 'DUR', 'IPTAL', 'İPTAL', 'UNSUBSCRIBE']);
/** Olaya özel bildirim şablonları (Meta'da onaylı olmalı); ayarlardan değiştirilebilir. */
const DEFAULT_EVENT_TEMPLATES: Record<string, { name: string; language: string }> = {
  'task.assigned': { name: 'gorev_atandi', language: 'tr' },
  'task.completed': { name: 'gorev_tamamlandi', language: 'tr' },
};
const EVENT_LABELS: Record<string, string> = { 'task.assigned': 'Görev atandı', 'task.completed': 'Görev tamamlandı' };
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Telefonu uluslararası biçime (+ olmadan) çevirir: 0532..., 532..., +90 532... → 90532...
 * Türkiye dışı numaralar ülke koduyla girilmelidir.
 */
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '9' + d;
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  if (!/^[1-9]\d{9,14}$/.test(d)) throw new BadRequestException('Geçersiz telefon numarası');
  return d;
}

/** WhatsApp şablon parametresi satır sonu/sekme ve 4'ten fazla ardışık boşluk içeremez, boş olamaz. */
const cleanParam = (s: string) => (s.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-').slice(0, 1000);

@Injectable()
export class WhatsappService implements OnModuleInit {
  private templateCache: { at: number; list: TemplateDef[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly client: WhatsappClient,
  ) {}

  onModuleInit() {
    // İç kullanıcılara bildirim kanalı. Olaya özel şablon (whatsapp.eventTemplates, örn. task.assigned → gorev_atandi)
    // yoksa genel bildirim şablonu kullanılır. Alıcı: kullanıcıya bağlı izinli kişi, yoksa kullanıcı kaydındaki telefon.
    this.notifications.registerChannel('whatsapp', {
      isConfigured: () => this.client.isConfigured(),
      send: async (userId, n) => {
        const tpl = (await this.eventTemplates()).find((t) => t.event === n.type) ?? (await this.notificationTemplate());
        if (!tpl?.name) throw new Error('Bildirim şablonu tanımlı değil (whatsapp.notificationTemplate)');
        const contact = await this.userContact(userId);
        const def = (await this.templates()).find((t) => t.name === tpl.name && (!tpl.language || t.language === tpl.language));
        const template: TemplateDef = def ?? { name: tpl.name, language: tpl.language || 'tr', params: n.delivery?.params?.length ?? 2 };
        const params = (n.delivery?.params ?? [n.title, n.body ?? '']).map(cleanParam).slice(0, template.params);
        while (params.length < template.params) params.push('-');
        await this.deliver(contact.id, contact.phone, template, params, null);
      },
    });
  }

  /**
   * Bildirim alıcısı: kullanıcı kaydındaki telefon (Ayarlar → Kullanıcılar); kişi kaydı kullanıcıya bağlanarak oluşturulur.
   * Telefon girilmemişse kullanıcıya bağlı, izin vermiş kişi kullanılır. "DUR" yazıp çıkmış numaraya gönderilmez.
   */
  private async userContact(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, phone: true, status: true } });
    if (!user || user.status !== 'active') throw new Error('Kullanıcı etkin değil');
    if (!user.phone) {
      const linked = await this.prisma.whatsappContact.findFirst({
        where: { userId, optInAt: { not: null }, optOutAt: null },
        orderBy: { optInAt: 'desc' },
      });
      if (linked) return linked;
      throw new Error('Kullanıcının telefon numarası tanımlı değil');
    }
    let phone: string;
    try { phone = normalizePhone(user.phone); } catch { throw new Error(`Kullanıcının telefon numarası geçersiz: ${user.phone}`); }
    const existing = await this.prisma.whatsappContact.findUnique({ where: { phone } });
    if (existing?.optOutAt) throw new Error('Kullanıcı WhatsApp bildirimlerini durdurmuş');
    if (existing && existing.userId && existing.userId !== userId) throw new Error('Telefon numarası başka bir kullanıcıya bağlı');
    if (existing?.userId === userId && existing.optInAt) return existing;
    return existing
      ? this.prisma.whatsappContact.update({ where: { id: existing.id }, data: { userId, optInAt: existing.optInAt ?? new Date() } })
      : this.prisma.whatsappContact.create({ data: { phone, name: user.fullName, userId, optInAt: new Date() } });
  }

  async recipients() {
    const users = await this.prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, fullName: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
    const contacts = await this.prisma.whatsappContact.findMany({
      where: { userId: { not: null } },
      include: { messages: { where: { direction: 'out' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const byUser = new Map<number, typeof contacts>();
    for (const c of contacts) byUser.set(c.userId!, [...(byUser.get(c.userId!) ?? []), c]);
    return users.map((u) => {
      let phone: string | null = null;
      if (u.phone) { try { phone = normalizePhone(u.phone); } catch { /* geçersiz */ } }
      const own = byUser.get(u.id) ?? [];
      const contact = own.find((c) => c.phone === phone) ?? null;
      const last = own.flatMap((c) => c.messages).reduce<(typeof own)[number]['messages'][number] | null>((a, m) => (!a || m.createdAt > a.createdAt ? m : a), null);
      const state = !u.phone ? 'no-phone' : !phone ? 'invalid' : contact?.optOutAt ? 'opted-out' : 'ok';
      return {
        id: u.id, fullName: u.fullName, phone: u.phone, normalized: phone, state,
        last: last && { status: last.status, templateName: last.templateName, error: last.error, createdAt: last.createdAt },
      };
    });
  }

  status() {
    const c = waConfig();
    return {
      configured: this.client.isConfigured(),
      phoneNumberIdSet: !!c.phoneNumberId,
      accessTokenSet: !!c.accessToken,
      appSecretSet: !!c.appSecret,
      verifyTokenSet: !!c.verifyToken,
      wabaIdSet: !!c.wabaId,
      apiVersion: c.apiVersion,
    };
  }

  // ---------- Şablonlar ----------

  /** Meta'dan (WABA tanımlıysa, 10 dk önbellek) ya da settings'teki elle girilmiş onaylı şablon listesi. */
  async templates(): Promise<TemplateDef[]> {
    if (waConfig().wabaId && this.client.isConfigured()) {
      if (this.templateCache && Date.now() - this.templateCache.at < 600000) return this.templateCache.list;
      try {
        const list = await this.client.approvedTemplates();
        this.templateCache = { at: Date.now(), list };
        return list;
      } catch (e) {
        console.error('WhatsApp şablonları alınamadı, ayarlardaki liste kullanılıyor', e);
      }
    }
    return this.settings.get<TemplateDef[]>('whatsapp.templates', []);
  }

  /** Bildirim olayı → onaylı şablon (ayarlardaki whatsapp.eventTemplates varsayılanların üstüne yazılır). */
  async eventTemplates() {
    const saved = await this.settings.get<Record<string, { name: string; language: string }>>('whatsapp.eventTemplates', {});
    return Object.entries({ ...DEFAULT_EVENT_TEMPLATES, ...saved }).map(([event, t]) => ({ event, label: EVENT_LABELS[event] ?? event, ...t }));
  }

  notificationTemplate() {
    return this.settings.get<{ name: string; language: string } | null>('whatsapp.notificationTemplate', null);
  }

  private async deliver(contactId: number, phone: string, template: TemplateDef, params: string[], userId: number | null) {
    const msg = await this.prisma.whatsappMessage.create({
      data: {
        direction: 'out',
        contactId,
        templateName: template.name,
        body: params.length ? params.join(' | ') : null,
        status: 'queued',
        createdById: userId,
      },
    });
    try {
      const providerMsgId = await this.client.sendTemplate(phone, template, params);
      return await this.prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'sent', providerMsgId } });
    } catch (e) {
      const error = String((e as Error)?.message ?? e).slice(0, 1000);
      await this.prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'failed', error } });
      throw new BadRequestException(`Mesaj gönderilemedi: ${error}`);
    }
  }

  // ---------- Webhook ----------

  verifyChallenge(mode?: string, token?: string, challenge?: string) {
    const { verifyToken } = waConfig();
    if (mode === 'subscribe' && verifyToken && token && safeEqual(token, verifyToken) && challenge) return challenge;
    return null;
  }

  /** X-Hub-Signature-256: "sha256=<hex HMAC(app secret, ham gövde)>". */
  verifySignature(raw: Buffer | undefined, header: string | undefined) {
    const { appSecret } = waConfig();
    if (!appSecret || !raw || !header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(raw).digest('hex');
    return safeEqual(header.slice(7), expected);
  }

  async handleWebhook(body: any) {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const v = change?.value ?? {};
        for (const s of v.statuses ?? []) await this.applyStatus(s);
        const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name]));
        for (const m of v.messages ?? []) await this.receive(m, names.get(String(m.from)));
      }
    }
  }

  private async applyStatus(s: any) {
    const status = String(s?.status ?? '');
    if (!s?.id || !['sent', 'delivered', 'read', 'failed'].includes(status)) return;
    const msg = await this.prisma.whatsappMessage.findFirst({ where: { providerMsgId: String(s.id) } });
    if (!msg) return;
    // Geç gelen "delivered", "read" durumunu geri almasın.
    if (status !== 'failed' && (STATUS_RANK[status] ?? 0) <= (STATUS_RANK[msg.status] ?? -1)) return;
    const error = status === 'failed' ? String(s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? 'Teslim edilemedi').slice(0, 1000) : undefined;
    await this.prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status, error } });
  }

  private async receive(m: any, profileName?: string) {
    if (!m?.from) return;
    let phone: string;
    try { phone = normalizePhone(String(m.from)); } catch { return; }
    if (m.id && (await this.prisma.whatsappMessage.count({ where: { providerMsgId: String(m.id) } }))) return; // tekrar teslim
    const text: string = m.type === 'text' ? String(m.text?.body ?? '') : m.type === 'button' ? String(m.button?.text ?? '') : `[${m.type}]`;
    let contact = await this.prisma.whatsappContact.findUnique({ where: { phone } });
    if (!contact) contact = await this.prisma.whatsappContact.create({ data: { phone, name: (profileName || phone).slice(0, 150) } });
    await this.prisma.whatsappMessage.create({
      data: { direction: 'in', contactId: contact.id, body: text.slice(0, 4000), status: 'received', providerMsgId: m.id ? String(m.id) : null },
    });
    if (OPT_OUT_WORDS.has(text.trim().toLocaleUpperCase('tr-TR'))) {
      await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { optOutAt: new Date() } });
      await this.prisma.auditLog.create({ data: { action: 'whatsapp.opt_out', entity: 'whatsapp_contact', entityId: String(contact.id) } });
    }
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
