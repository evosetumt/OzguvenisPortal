/**
 * İsteği yapan istemcinin IP'si (giriş denemesi sınırı için).
 * Cloudflare Tunnel'da istek bu sürece cloudflared'den (yerel adres) gelir; gerçek IP CF-Connecting-IP başlığındadır.
 * Başlığa yalnız istek yerel adresten geldiyse güvenilir: ağdan doğrudan gelen biri başlığı uydurup sınırı aşamasın.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function clientIp(req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const remote = req.socket?.remoteAddress ?? req.ip;
  const cf = req.headers?.['cf-connecting-ip'];
  if (remote && LOOPBACK.has(remote) && typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.ip;
}
