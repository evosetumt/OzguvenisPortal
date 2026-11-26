/**
 * Cari Hesaplar: dönem (tarih aralığı) hesapları ve sıralama. Saf fonksiyonlar (veritabanı yok).
 *
 * Önbellek (ErpAccountTx) yalnızca son ERP_SYNC_WINDOW_DAYS günün hareketlerini tutar; ErpCustomer.balance ise
 * Netsis'teki tüm zamanların bakiyesidir. Bu yüzden:
 *   dönem borç/alacak = aralıktaki hareketlerin toplamı (aralık pencere içindeyse kesin)
 *   dönem sonu bakiye = güncel bakiye − bitişten sonraki hareketlerin net etkisi (bitiş pencere içindeyse kesin)
 */

export const ACCOUNT_SORTS = ['name', 'code', 'debit', 'credit', 'balance'] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];
export type SortDir = 'asc' | 'desc';

export interface AccountNums { code: string; name: string; debit: number; credit: number; balance: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aralık için cari rakamları: borç/alacak aralıktaki hareketlerden, bakiye bitiş tarihindeki (dönem sonu) bakiye.
 * inRange / afterTo: cari koduna göre { debit, credit } toplamları.
 */
export function periodNums<T extends { code: string; balance: number }>(
  c: T,
  inRange: Map<string, { debit: number; credit: number }>,
  afterTo: Map<string, { debit: number; credit: number }> | null,
): T & { debit: number; credit: number; balance: number } {
  const p = inRange.get(c.code) ?? { debit: 0, credit: 0 };
  const a = afterTo?.get(c.code);
  const closing = a ? c.balance - (a.debit - a.credit) : c.balance;
  return { ...c, debit: r2(p.debit), credit: r2(p.credit), balance: r2(closing) };
}

/** Yeni dizi döner (girdi değişmez). Eşit değerlerde cari koduna göre sabit sıra. */
export function sortAccounts<T extends AccountNums>(rows: readonly T[], sort: AccountSort, dir: SortDir): T[] {
  const sign = dir === 'desc' ? -1 : 1;
  const cmp = (a: T, b: T) => {
    const v = sort === 'name' || sort === 'code' ? a[sort].localeCompare(b[sort], 'tr') : a[sort] - b[sort];
    return v * sign || a.code.localeCompare(b.code, 'tr');
  };
  return [...rows].sort(cmp);
}

/** Liste altındaki toplamlar (hariç tutulanlar çağıran tarafta düşülür). */
export function sumAccounts(rows: readonly AccountNums[]) {
  const t = rows.reduce((s, x) => ({ debit: s.debit + x.debit, credit: s.credit + x.credit, balance: s.balance + x.balance }), { debit: 0, credit: 0, balance: 0 });
  return { debit: r2(t.debit), credit: r2(t.credit), balance: r2(t.balance) };
}

/**
 * Ekstreyi aralığa indirger. txs tarih sırasıyla, bakiye (running) zaten hesaplanmış olmalı.
 * opening = başlangıçtan önceki son bakiye (yoksa pencere devri).
 */
export function statementInRange<T extends { date: Date | string; debit: number; credit: number; balance: number }>(
  txs: readonly T[], windowOpening: number, from?: Date, to?: Date,
) {
  const t = (x: T) => new Date(x.date).getTime();
  const before = from ? txs.filter((x) => t(x) < from.getTime()) : [];
  const opening = before.length ? before[before.length - 1].balance : windowOpening;
  const rows = txs.filter((x) => (!from || t(x) >= from.getTime()) && (!to || t(x) < to.getTime()));
  const debit = r2(rows.reduce((n, x) => n + x.debit, 0));
  const credit = r2(rows.reduce((n, x) => n + x.credit, 0));
  return { opening: r2(opening), rows, debit, credit, closing: r2(opening + debit - credit) };
}
