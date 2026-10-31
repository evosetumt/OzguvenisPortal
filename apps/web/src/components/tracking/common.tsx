import { dateKey } from '../../lib/format';
import type { TrackStatus } from '../../lib/types-tracking';

/** Gün olarak saklanan tarih (UTC gece yarısı) → "31 Mar 2027" */
export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(dateKey(iso) + 'T00:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

export const fmtMoney = (v: string | number | null | undefined, currency = 'TRY') =>
  v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('tr-TR', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'TRY', maximumFractionDigits: 2 });

/** Kalan gün rozeti: süresi geçmiş kırmızı, 7 gün içi turuncu-kırmızı, 30 gün içi turuncu. */
export function DaysLeft({ days, status }: { days: number; status?: TrackStatus }) {
  if (status === 'renewed') return <span className="left muted">Yenilendi</span>;
  if (status === 'cancelled') return <span className="left muted">İptal</span>;
  if (days < 0) return <span className="left over">{-days} gün geçti</span>;
  if (days === 0) return <span className="left urgent">Bugün</span>;
  const cls = days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'ok';
  return <span className={'left ' + cls}>{days} gün</span>;
}
