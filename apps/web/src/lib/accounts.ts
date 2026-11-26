// Cari Hesaplar ekranının saf yardımcıları (filtre, sıralama, tarih aralığı sorgusu)

/** Netsis CARI_TIP kodları. Listede olmayan kod olduğu gibi gösterilir. */
export const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  A: 'Alıcı',
  S: 'Satıcı',
  T: 'Toptancı',
  K: 'Kefil',
  M: 'Müstahsil',
  D: 'Diğer',
};

export const customerTypeLabel = (t: string | null | undefined) => (t ? CUSTOMER_TYPE_LABEL[t.toUpperCase()] ?? t : 'Tanımsız');

export type AccountSortKey = 'name' | 'code' | 'debit' | 'credit' | 'balance';
export type SortDirection = 'asc' | 'desc';

export const ACCOUNT_SORT_OPTIONS: { value: `${AccountSortKey}:${SortDirection}`; label: string }[] = [
  { value: 'name:asc', label: 'Ünvan A→Z' },
  { value: 'name:desc', label: 'Ünvan Z→A' },
  { value: 'code:asc', label: 'Kod A→Z' },
  { value: 'code:desc', label: 'Kod Z→A' },
  { value: 'balance:desc', label: 'Bakiye (yüksek)' },
  { value: 'balance:asc', label: 'Bakiye (düşük)' },
  { value: 'debit:desc', label: 'Borç (yüksek)' },
  { value: 'debit:asc', label: 'Borç (düşük)' },
  { value: 'credit:desc', label: 'Alacak (yüksek)' },
  { value: 'credit:asc', label: 'Alacak (düşük)' },
];

/** Sayısal sütunlarda ilk tıklama büyükten küçüğe, metin sütunlarında A→Z. Aynı sütun tekrar tıklanınca yön döner. */
export function nextSort(cur: { key: AccountSortKey; dir: SortDirection }, key: AccountSortKey): { key: AccountSortKey; dir: SortDirection } {
  if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'name' || key === 'code' ? 'asc' : 'desc' };
}

/**
 * <input type="date"> değerlerinden API sorgusu: başlangıç yerel gün başı (dahil),
 * bitiş ertesi günün başı (hariç) — Siparişler ekranıyla aynı kural.
 */
export function dateRangeParams(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    out.to = d.toISOString();
  }
  return out;
}

/** Date → <input type="date"> değeri (yerel gün). */
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
