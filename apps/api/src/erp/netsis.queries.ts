/**
 * Netsis'ten okunan TÜM SQL sorguları bu dosyadadır. Kurulumdaki Netsis sürümüne/ayarına göre
 * (belge tipi kodları, döviz, ek alanlar) yalnızca burası uyarlanır. Kurallar:
 * - Yalnızca SELECT. Parametreler @from gibi adlandırılmış parametrelerle verilir (string birleştirme yok).
 * - WITH (NOLOCK): Netsis'in canlı işlemlerini kilitlemeden okur (anlık tutarsızlık sonraki senkronda düzelir).
 * - Netsis char/varchar alanları boşlukla doldurulmuş olabilir → RTRIM.
 * - Sütun takma adları senkron servisinin beklediği alan adlarıdır; değiştirmeyin.
 *
 * Belge tipi (FTIRSIP) kodları (standart Netsis):
 *   TBLSIPAMAS: '6' müşteri siparişi, '7' satıcı siparişi
 *   TBLFATUIRS / TBLSTHAR: '1' satış faturası, '2' alış faturası, '3' satış irsaliyesi, '4' alış irsaliyesi
 *   TBLTEKLIFMAS: 'G' satış talebi, 'H' satış teklifi, 'C' satın alma talebi, 'D' satın alma teklifi
 * KAPATILMIS (TBLSIPAMAS): 'S' açık, 'K' kapatılmış. TIPI = 1 da kapatılmış siparişi gösterir.
 * Kaynak: Netsis veri sözlüğü (proje kökündeki "NETSIS VERITABANI.xls", FATURA ve TALEP-TEKLİF sayfaları).
 */

/** Kapatılmış belge işaretleri (KAPATILMIS). 'E' eski/özel kurulumlar için tutulur. */
export const CLOSED_FLAGS = ['K', 'E'];
// Teklif sorgularında FTIRSIP IN ('H'): portalda yalnızca satış teklifleri gösterilir.

/** Cari kartlar + TBLCAHAR'dan tüm zamanların borç/alacak toplamı (bakiye için). */
export const Q_CUSTOMERS = `
SELECT RTRIM(c.CARI_KOD) AS code, RTRIM(c.CARI_ISIM) AS name, RTRIM(c.CARI_TIP) AS type,
       RTRIM(c.VERGI_DAIRESI) AS taxOffice, RTRIM(c.VERGI_NUMARASI) AS taxNo, RTRIM(c.CARI_TEL) AS phone,
       RTRIM(c.EMAIL) AS email, RTRIM(c.CARI_IL) AS city, RTRIM(c.CARI_ADRES) AS address,
       RTRIM(c.PLASIYER_KODU) AS repCode, ISNULL(c.DUZELTMETARIHI, c.KAYITTARIHI) AS updatedAt,
       ISNULL(h.debit, 0) AS debit, ISNULL(h.credit, 0) AS credit
FROM TBLCASABIT c WITH (NOLOCK)
LEFT JOIN (
  SELECT CARI_KOD, SUM(ISNULL(BORC, 0)) AS debit, SUM(ISNULL(ALACAK, 0)) AS credit
  FROM TBLCAHAR WITH (NOLOCK) GROUP BY CARI_KOD
) h ON h.CARI_KOD = c.CARI_KOD`;

/** Cari hareketler (ekstre), pencere içindeki tarihler. */
export const Q_ACCOUNT_TX = `
SELECT INC_KEY_NUMBER AS id, RTRIM(CARI_KOD) AS customerCode, TARIH AS date, VADE_TARIHI AS dueDate,
       RTRIM(BELGE_NO) AS docNo, RTRIM(ACIKLAMA) AS description, RTRIM(HAREKET_TURU) AS txType,
       ISNULL(BORC, 0) AS debit, ISNULL(ALACAK, 0) AS credit, RTRIM(PLASIYER_KODU) AS repCode
FROM TBLCAHAR WITH (NOLOCK)
WHERE TARIH >= @from AND INC_KEY_NUMBER IS NOT NULL`;

/** Sipariş başlıkları. Tutarlar Netsis'teki TL karşılıklarıdır (GENELTOPLAM). */
export const Q_ORDERS = `
SELECT RTRIM(m.FTIRSIP) AS ftirsip, RTRIM(m.FATIRS_NO) AS docNo, RTRIM(m.CARI_KODU) AS customerCode,
       m.TARIH AS date, m.ODEMETARIHI AS dueDate, RTRIM(m.ACIKLAMA) AS description,
       ISNULL(m.BRUTTUTAR, 0) AS gross, ISNULL(m.KDV, 0) AS vat, ISNULL(m.GENELTOPLAM, 0) AS total,
       RTRIM(m.PLA_KODU) AS repCode, CASE WHEN m.TIPI = 1 THEN 'K' ELSE RTRIM(m.KAPATILMIS) END AS closed,
       m.KAYITTARIHI AS createdAt, m.DUZELTMETARIHI AS updatedAt
FROM TBLSIPAMAS m WITH (NOLOCK)
WHERE m.FTIRSIP IN ('6', '7') AND m.TARIH >= @from`;

/** Sipariş satırları (stok adı ve birimi stok kartından). */
export const Q_ORDER_ITEMS = `
SELECT RTRIM(t.STHAR_FTIRSIP) AS ftirsip, RTRIM(t.FISNO) AS docNo, ISNULL(t.SIRA, 0) AS [lineNo],
       RTRIM(t.STOK_KODU) AS stockCode, RTRIM(s.STOK_ADI) AS stockName, RTRIM(s.OLCU_BR1) AS unit,
       ISNULL(t.STHAR_GCMIK, 0) AS qty, ISNULL(t.STHAR_NF, 0) AS unitPrice, ISNULL(t.STHAR_KDV, 0) AS vatRate
FROM TBLSIPATRA t WITH (NOLOCK)
JOIN TBLSIPAMAS m WITH (NOLOCK) ON m.FATIRS_NO = t.FISNO AND m.FTIRSIP = t.STHAR_FTIRSIP
LEFT JOIN TBLSTSABIT s WITH (NOLOCK) ON s.STOK_KODU = t.STOK_KODU
WHERE m.FTIRSIP IN ('6', '7') AND m.TARIH >= @from`;

/**
 * Siparişe bağlı sevk miktarları: stok hareketlerinde STHAR_SIPNUM = sipariş no.
 * İrsaliye faturaya dönüştürüldüğünde aynı miktar iki belge tipinde görünebilir; servis her
 * (sipariş, stok) için irsaliye ve fatura toplamlarının BÜYÜĞÜNÜ alır (çift sayımı önler).
 */
export const Q_SHIPPED_QTY = `
SELECT RTRIM(h.STHAR_SIPNUM) AS orderNo, RTRIM(h.STOK_KODU) AS stockCode, RTRIM(h.STHAR_FTIRSIP) AS ftirsip,
       SUM(ISNULL(h.STHAR_GCMIK, 0)) AS qty
FROM TBLSTHAR h WITH (NOLOCK)
WHERE h.STHAR_FTIRSIP IN ('1', '2', '3', '4') AND h.STHAR_TARIH >= @from
  AND h.STHAR_SIPNUM IS NOT NULL AND RTRIM(h.STHAR_SIPNUM) <> ''
GROUP BY h.STHAR_SIPNUM, h.STOK_KODU, h.STHAR_FTIRSIP`;

/** Teklif başlıkları (TBLTEKLIFMAS, sipariş tablosuyla aynı yapı). */
export const Q_QUOTES = `
SELECT RTRIM(m.FTIRSIP) AS ftirsip, RTRIM(m.FATIRS_NO) AS docNo, RTRIM(m.CARI_KODU) AS customerCode,
       m.TARIH AS date, m.ODEMETARIHI AS dueDate, RTRIM(m.ACIKLAMA) AS description,
       ISNULL(m.BRUTTUTAR, 0) AS gross, ISNULL(m.KDV, 0) AS vat, ISNULL(m.GENELTOPLAM, 0) AS total,
       RTRIM(m.PLA_KODU) AS repCode, RTRIM(m.KAPATILMIS) AS closed,
       m.KAYITTARIHI AS createdAt, m.DUZELTMETARIHI AS updatedAt
FROM TBLTEKLIFMAS m WITH (NOLOCK)
WHERE m.FTIRSIP IN ('H') AND m.TARIH >= @from`;

export const Q_QUOTE_ITEMS = `
SELECT RTRIM(t.FISNO) AS docNo, ISNULL(t.SIRA, 0) AS [lineNo],
       RTRIM(t.STOK_KODU) AS stockCode, RTRIM(s.STOK_ADI) AS stockName, RTRIM(s.OLCU_BR1) AS unit,
       ISNULL(t.STHAR_GCMIK, 0) AS qty, ISNULL(t.STHAR_NF, 0) AS unitPrice, ISNULL(t.STHAR_KDV, 0) AS vatRate
FROM TBLTEKLIFTRA t WITH (NOLOCK)
JOIN TBLTEKLIFMAS m WITH (NOLOCK) ON m.FATIRS_NO = t.FISNO AND m.FTIRSIP = t.STHAR_FTIRSIP
LEFT JOIN TBLSTSABIT s WITH (NOLOCK) ON s.STOK_KODU = t.STOK_KODU
WHERE m.FTIRSIP IN ('H') AND m.TARIH >= @from`;

/** Sevk belgeleri: satış faturası ('1') ve satış irsaliyesi ('3'), bağlı sipariş numaralarıyla (SQL Server 2017+). */
export const Q_SHIPMENTS = `
SELECT RTRIM(f.FTIRSIP) AS ftirsip, RTRIM(f.FATIRS_NO) AS docNo, RTRIM(f.CARI_KODU) AS customerCode,
       f.TARIH AS date, ISNULL(f.GENELTOPLAM, 0) AS total, RTRIM(f.PLA_KODU) AS repCode, f.KAYITTARIHI AS createdAt,
       (SELECT STRING_AGG(x.n, ',') FROM (
          SELECT DISTINCT RTRIM(h.STHAR_SIPNUM) AS n FROM TBLSTHAR h WITH (NOLOCK)
          WHERE h.FISNO = f.FATIRS_NO AND h.STHAR_FTIRSIP = f.FTIRSIP AND ISNULL(RTRIM(h.STHAR_SIPNUM), '') <> ''
        ) x) AS orderNos
FROM TBLFATUIRS f WITH (NOLOCK)
WHERE f.FTIRSIP IN ('1', '3') AND f.TARIH >= @from`;

/** Bağlantı testi. */
export const Q_PING = `SELECT DB_NAME() AS db, @@VERSION AS version`;

/** FTIRSIP → portal sipariş türü */
export const ORDER_KIND: Record<string, 'sales' | 'purchase'> = { '6': 'sales', '7': 'purchase' };
/** Sevk hareketinin hangi sipariş türüne ait olduğu: satış belgeleri satış siparişini, alış belgeleri satıcı siparişini kapatır. */
export const SHIP_KIND: Record<string, 'sales' | 'purchase'> = { '1': 'sales', '3': 'sales', '2': 'purchase', '4': 'purchase' };
export const SHIP_DOC_TYPE: Record<string, 'invoice' | 'waybill'> = { '1': 'invoice', '3': 'waybill' };
