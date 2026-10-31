/** Tarih (yalnız gün): "5 Kasım 2026" / year:false → "5 Kasım". Tarihler UTC gece yarısı saklandığı için UTC'de biçimlenir. */
export const fmtDateTr = (d: string | Date, opts: { year?: boolean } = {}) =>
  new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', ...(opts.year === false ? {} : { year: 'numeric' }), timeZone: 'UTC' });

/** Boş olmayan, tekrarsız kullanıcı kimlikleri (bildirim alıcıları, takipçiler). */
export const uniqIds = (...ids: (number | null | undefined)[]) => [...new Set(ids.filter((x): x is number => !!x))];
