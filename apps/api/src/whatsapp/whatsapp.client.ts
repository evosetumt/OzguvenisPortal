import { Injectable, OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../common/settings.service';
import { openSecret, sealSecret } from '../common/secret-box';

export interface TemplateDef {
  name: string;
  language: string; // örn. tr
  params: number; // gövdedeki {{n}} sayısı
  description?: string;
}

/** WhatsApp Cloud API bağlantısı. Ayarlar → WhatsApp ekranından girilir (settings: whatsapp.config); girilmemişse WHATSAPP_* ortam değişkenleri. */
export interface WaConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  wabaId: string;
  apiVersion: string;
  graphUrl: string;
}
/** Ekrandan girilen gizli alanlar (şifreli saklanır, ekrana geri dönmez). */
export const WA_SECRETS = ['accessToken', 'appSecret', 'verifyToken'] as const;
export type WaSecret = (typeof WA_SECRETS)[number];
export type WaSettingsInput = Pick<WaConfig, 'phoneNumberId' | 'wabaId' | 'apiVersion'> & Partial<Record<WaSecret, string>>;
type Stored = Pick<WaConfig, 'phoneNumberId' | 'wabaId' | 'apiVersion'> & Partial<Record<WaSecret, string>>;

const KEY = 'whatsapp.config';
const DEFAULT_API_VERSION = 'v21.0';

const fromEnv = (): WaConfig => ({
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
  appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  wabaId: process.env.WHATSAPP_WABA_ID ?? '',
  apiVersion: process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION,
  graphUrl: (process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
});

export class WhatsappApiError extends Error {}

/** WhatsApp Cloud API (Graph API) istemcisi. Yalnızca şablon mesajı gönderir. */
@Injectable()
export class WhatsappClient implements OnModuleInit {
  private cfg: WaConfig = fromEnv();
  private source: 'settings' | 'env' | 'none' = 'none';

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit() {
    await this.load();
  }

  private async load() {
    const env = fromEnv();
    const s = await this.settings.get<Stored | null>(KEY, null);
    if (!s?.phoneNumberId) {
      this.cfg = env;
      this.source = env.phoneNumberId && env.accessToken ? 'env' : 'none';
      return;
    }
    const secret = (k: WaSecret) => {
      try { return s[k] ? openSecret(s[k]!, `${KEY}.${k}`) : ''; } catch { return ''; } // JWT_SECRET değiştiyse yeniden girilir
    };
    this.cfg = {
      ...env,
      phoneNumberId: s.phoneNumberId, wabaId: s.wabaId ?? '', apiVersion: s.apiVersion || DEFAULT_API_VERSION,
      accessToken: secret('accessToken'), appSecret: secret('appSecret'), verifyToken: secret('verifyToken'),
    };
    this.source = 'settings';
  }

  /** Etkin bağlantı ayarları (çağrı anında; gizli alanlar dahil, yalnızca sunucu içinde kullanılır). */
  config(): WaConfig {
    return this.cfg;
  }

  isConfigured() {
    return !!(this.cfg.phoneNumberId && this.cfg.accessToken);
  }

  /** Ayarlar ekranı için: gizli alanlar dönmez, yalnızca kayıtlı olup olmadıkları. */
  getSettings() {
    const c = this.cfg;
    return {
      phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, apiVersion: c.apiVersion, source: this.source,
      accessTokenSet: !!c.accessToken, appSecretSet: !!c.appSecret, verifyTokenSet: !!c.verifyToken,
    };
  }

  /** Gizli alan undefined → etkin değer korunur (ortam değişkeninden gelse de), '' → silinir. */
  async saveSettings(input: WaSettingsInput) {
    const next: Stored = { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, apiVersion: input.apiVersion || DEFAULT_API_VERSION };
    for (const k of WA_SECRETS) {
      const plain = input[k] === undefined ? this.cfg[k] : input[k];
      if (plain) next[k] = sealSecret(plain, `${KEY}.${k}`);
    }
    await this.settings.set(KEY, next);
    await this.load();
    return this.getSettings();
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const c = this.cfg;
    const res = await fetch(`${c.graphUrl}/${c.apiVersion}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new WhatsappApiError(body?.error?.message ?? `WhatsApp API hatası (${res.status})`);
    return body as T;
  }

  /** Dönen değer sağlayıcının mesaj kimliği (wamid...). */
  async sendTemplate(to: string, template: TemplateDef, params: string[]) {
    const c = this.cfg;
    const components = params.length
      ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
      : [];
    const r = await this.call<{ messages?: { id: string }[] }>(`${c.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template.name, language: { code: template.language }, components },
      }),
    });
    const id = r.messages?.[0]?.id;
    if (!id) throw new WhatsappApiError('WhatsApp API mesaj kimliği dönmedi');
    return id;
  }

  /** WHATSAPP_WABA_ID verilmişse Meta'da onaylı şablonları çeker. */
  async approvedTemplates(): Promise<TemplateDef[]> {
    const c = this.cfg;
    const r = await this.call<{ data?: any[] }>(`${c.wabaId}/message_templates?status=APPROVED&limit=200&fields=name,language,status,components`);
    return (r.data ?? [])
      .filter((t) => t.status === 'APPROVED')
      .map((t) => {
        const body = (t.components ?? []).find((x: any) => x.type === 'BODY')?.text ?? '';
        const params = new Set((body.match(/\{\{\s*\d+\s*\}\}/g) ?? []) as string[]).size;
        return { name: t.name, language: t.language, params, description: body.slice(0, 200) };
      });
  }
}
