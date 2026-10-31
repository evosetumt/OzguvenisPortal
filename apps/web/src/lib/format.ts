// Bitiş tarihleri API'de UTC gece yarısı olarak saklanır; tarih kısmı UTC'den okunur.
export const dateKey = (iso: string) => iso.slice(0, 10);

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Bugün", "Yarın", "Dün" veya "12 Kas" */
export function formatDue(iso: string) {
  const k = dateKey(iso);
  const t = new Date(todayKey() + 'T00:00:00Z').getTime();
  const diff = Math.round((new Date(k + 'T00:00:00Z').getTime() - t) / 86400000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  return new Date(k + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const isOverdue = (iso: string | null, done: boolean) => !!iso && !done && dateKey(iso) < todayKey();
export const isToday = (iso: string | null) => !!iso && dateKey(iso) === todayKey();

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'şimdi';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toLocaleUpperCase('tr-TR')).join('');
