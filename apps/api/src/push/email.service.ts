import { Injectable, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings.service';
import type { ChannelSender, NewNotification } from '../notifications/notifications.service';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Ayarlar → Bildirim kuralları ekranından girilen SMTP ayarları (settings tablosu, anahtar mail.smtp). */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // 465 için true, 587 (STARTTLS) için false
  user: string;
  from: string; // "Özgüveniş Portal <portal@ozguvenis.com.tr>"
  portalUrl: string; // e-postadaki "Portalda aç" bağlantısı
}
type Stored = SmtpConfig & { password?: string }; // password: şifreli (v1:iv:tag:veri)

const KEY = 'mail.smtp';
// Şifre veritabanında düz durmasın: JWT_SECRET'tan türetilen anahtarla AES-256-GCM. Sır değişirse şifre yeniden girilir.
const secretKey = () => createHash('sha256').update(`${process.env.JWT_SECRET ?? ''}:mail.smtp`).digest();
const seal = (plain: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
};
const open = (sealed: string) => {
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1') throw new Error('Bilinmeyen şifre biçimi');
  const d = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
};

/** Ortam değişkenleriyle eski kurulum: ekrandan ayar girilmemişse bunlar kullanılır. */
function fromEnv(): (SmtpConfig & { pass?: string }) | null {
  const e = process.env;
  if (!e.SMTP_HOST || !e.MAIL_FROM) return null;
  return {
    host: e.SMTP_HOST, port: Number(e.SMTP_PORT ?? 587), secure: e.SMTP_SECURE === 'true',
    user: e.SMTP_USER ?? '', pass: e.SMTP_PASSWORD, from: e.MAIL_FROM, portalUrl: (e.PORTAL_URL ?? '').replace(/\/$/, ''),
  };
}

/** "email" kanalı: SMTP üzerinden düz bir HTML bildirim e-postası. */
@Injectable()
export class EmailService implements ChannelSender, OnModuleInit {
  private transport: nodemailer.Transporter | null = null;
  private cfg: (SmtpConfig & { pass?: string }) | null = null;
  private source: 'settings' | 'env' | 'none' = 'none';

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async onModuleInit() {
    await this.load();
  }

  private async load() {
    const s = await this.settings.get<Stored | null>(KEY, null);
    this.transport = null;
    if (!s?.host || !s.from) {
      this.cfg = fromEnv();
      this.source = this.cfg ? 'env' : 'none';
      return;
    }
    let pass: string | undefined;
    try { pass = s.password ? open(s.password) : undefined; } catch { pass = undefined; } // JWT_SECRET değiştiyse şifre yeniden girilir
    const { password: _sealed, ...rest } = s;
    this.cfg = { ...rest, pass };
    this.source = 'settings';
  }

  isConfigured() {
    return !!this.cfg;
  }

  /** Yönetim ekranı için: şifre hiçbir zaman dönmez, yalnızca kayıtlı olup olmadığı. */
  getConfig() {
    const c = this.cfg;
    return {
      host: c?.host ?? '', port: c?.port ?? 587, secure: c?.secure ?? false, user: c?.user ?? '',
      from: c?.from ?? '', portalUrl: c?.portalUrl ?? '', passwordSet: !!c?.pass, source: this.source,
    };
  }

  /** password: undefined → mevcut şifre korunur, '' → silinir. */
  async saveConfig(c: SmtpConfig & { password?: string }) {
    const prev = await this.settings.get<Stored | null>(KEY, null);
    const { password, ...rest } = c;
    const sealed = password === undefined ? prev?.password : password ? seal(password) : undefined;
    await this.settings.set(KEY, { ...rest, ...(sealed ? { password: sealed } : {}) });
    await this.load();
    return this.getConfig();
  }

  private get tx() {
    const c = this.cfg!;
    this.transport ??= nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    });
    return this.transport;
  }

  /** Ayarları denemek için: bağlantıyı doğrular ve verilen adrese deneme e-postası yollar. */
  async sendTest(to: string, fullName: string) {
    if (!this.cfg) throw new Error('SMTP ayarları girilmemiş');
    await this.tx.verify();
    await this.mail(to, fullName, { type: 'system.test', title: 'Deneme e-postası', body: 'Özgüveniş Portal e-posta ayarları çalışıyor.', link: '/settings' });
  }

  async send(userId: number, n: NewNotification) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, status: true } });
    if (!user || user.status !== 'active') throw new Error('Kullanıcı etkin değil');
    await this.mail(user.email, user.fullName, n);
  }

  private async mail(to: string, fullName: string, n: NewNotification) {
    const base = this.cfg?.portalUrl ?? '';
    const url = base && n.link ? `${base}/#${n.link}` : base;
    const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<p>Merhaba ${esc(fullName)},</p>
<h2 style="font-size:18px;margin:16px 0 8px">${esc(n.title)}</h2>
${n.body ? `<p>${esc(n.body)}</p>` : ''}
${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Portalda aç</a></p>` : ''}
<p style="color:#6b7280;font-size:12px">Bu e-posta Özgüveniş Portal tarafından otomatik gönderildi. Bildirim tercihlerinizi Ayarlar sayfasından değiştirebilirsiniz.</p>
</body></html>`;
    await this.tx.sendMail({
      from: this.cfg!.from,
      to,
      subject: n.title,
      text: [n.title, n.body, url].filter(Boolean).join('\n\n'),
      html,
    });
  }
}
