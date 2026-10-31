/**
 * Tarayıcı deposu (localStorage): gizli pencere, kapalı site verisi veya önizlemede erişim hata verebilir;
 * okuma null döner, yazma sessizce atlanır. Yalnız cihaza özel kolaylıklar içindir (tercih, son görünüm...).
 */
export function storeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** null verilirse anahtar silinir. */
export function storeSet(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* depo kapalı */ }
}
