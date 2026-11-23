import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Ayarlar tablosunda saklanan şifreler (SMTP, Netsis) düz durmasın diye AES-256-GCM ile şifrelenir.
 * Anahtar JWT_SECRET ve kullanım amacından (purpose) türetilir; sır değişirse kayıtlı şifreler çözülemez ve yeniden girilir.
 * Biçim: v1:<iv>:<etiket>:<veri> (base64).
 */
const keyFor = (purpose: string) => createHash('sha256').update(`${process.env.JWT_SECRET ?? ''}:${purpose}`).digest();

export function sealSecret(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFor(purpose), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Çözülemezse (bozuk veri, değişmiş JWT_SECRET) hata fırlatır. */
export function openSecret(sealed: string, purpose: string): string {
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Bilinmeyen şifre biçimi');
  const d = createDecipheriv('aes-256-gcm', keyFor(purpose), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
