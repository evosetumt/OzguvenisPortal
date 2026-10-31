import { Injectable } from '@nestjs/common';

export interface TemplateDef {
  name: string;
  language: string; // örn. tr
  params: number; // gövdedeki {{n}} sayısı
  description?: string;
}

/** Ortam değişkenleri çağrı anında okunur; yapılandırılmamışsa modül pasif kalır. */
export const waConfig = () => ({
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
  appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  wabaId: process.env.WHATSAPP_WABA_ID ?? '',
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  graphUrl: (process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
});

export class WhatsappApiError extends Error {}

/** WhatsApp Cloud API (Graph API) istemcisi. Yalnızca şablon mesajı gönderir. */
@Injectable()
export class WhatsappClient {
  isConfigured() {
    const c = waConfig();
    return !!(c.phoneNumberId && c.accessToken);
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const c = waConfig();
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
    const c = waConfig();
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
    const c = waConfig();
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
