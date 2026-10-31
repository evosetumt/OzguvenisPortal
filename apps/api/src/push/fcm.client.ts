import { createSign } from 'node:crypto';
import type { Delivery } from '../notifications/notifications.service';
import { readFileSync } from 'node:fs';

interface ServiceAccount { client_email: string; private_key: string; project_id?: string }

/** FCM gönderim sonucu: jeton geçersizse çağıran kaydı siler. */
export class FcmTokenGoneError extends Error {}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/**
 * FCM HTTP v1 istemcisi (firebase-admin bağımlılığı olmadan).
 * Google hizmet hesabı JSON'u ile OAuth2 JWT bearer akışından erişim belirteci alır ve önbelleğe koyar.
 */
export class FcmClient {
  private account: ServiceAccount | null = null;
  private projectId = process.env.FCM_PROJECT_ID ?? '';
  private cached: { token: string; exp: number } | null = null;

  constructor() {
    const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
    if (!file) return;
    try {
      this.account = JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
      this.projectId ||= this.account.project_id ?? '';
    } catch (e) {
      console.error('FCM hizmet hesabı dosyası okunamadı:', file, e);
    }
  }

  get configured() {
    return !!(this.account?.client_email && this.account.private_key && this.projectId);
  }

  private async accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.exp - 60 > now) return this.cached.token;
    const a = this.account!;
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
      iss: a.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(a.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new Error(`FCM erişim belirteci alınamadı (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: j.access_token, exp: now + j.expires_in };
    return j.access_token;
  }

  /**
   * Web jetonuna yalnızca veri mesajı gider; bildirimi portalın service worker'ı (sw.js) gösterir ve tıklanınca bağlantıyı açar.
   * Mobile bildirim + veri gider (uygulama kapalıyken işletim sistemi gösterir). Teslim seçenekleri (Delivery) veri alanlarına
   * dizgi olarak eklenir; service worker türe bakmadan bunlara göre gösterir/kapatır.
   */
  async send(token: string, platform: string, m: Delivery & { title: string; body: string; link: string }) {
    const flag = (on?: boolean) => (on ? '1' : undefined);
    const data = Object.fromEntries(Object.entries({
      title: m.title, body: m.body, link: m.link, tag: m.tag, openLabel: m.openLabel, sticky: flag(m.sticky), close: flag(m.close),
    }).filter(([, v]) => v !== undefined)) as Record<string, string>;
    const ttl = m.urgent ? 60 : 24 * 3600;
    const message = platform === 'web'
      ? { token, data, webpush: { headers: { Urgency: 'high', TTL: String(ttl) } } }
      : {
        token,
        notification: { title: m.title, body: m.body },
        data,
        android: { priority: 'high', ttl: `${ttl}s`, notification: { sound: 'default', ...(m.tag ? { tag: m.tag } : {}) } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (res.ok) return;
    const text = await res.text();
    if (res.status === 404 || text.includes('UNREGISTERED') || (res.status === 400 && text.includes('registration token'))) {
      throw new FcmTokenGoneError('FCM jetonu geçersiz');
    }
    throw new Error(`FCM ${res.status}: ${text.slice(0, 300)}`);
  }
}
