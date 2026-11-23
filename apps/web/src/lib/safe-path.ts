/**
 * Bildirim/takvim kaydından gelen bağlantı yalnız uygulama içi bir yol olabilir.
 * "//site" ve "/\site" gibi biçimler tarayıcıda başka siteye gider (açık yönlendirme), reddedilir.
 */
export function safeAppPath(link: unknown): string | null {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  return link;
}
