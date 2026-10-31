import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { NetsisClient } from './netsis.client';

/**
 * Netsis e-belge XML'leri (salt okunur):
 *   TBLEFATURA (FTIRSIP 1: satış "Faturamız", 2: alış "Faturanız") → ZARFID → TBLEFATZARF.XMLBYTES: GİB zarfı (ZIP içinde
 *     StandardBusinessDocument; bir zarfta birden fazla fatura olabilir, faturanın UUID'si ile seçilir).
 *     TBLEFATURA.XMLVERI çoğunlukla boştur; doluysa doğrudan kullanılır.
 *   TBLEARSIV.XMLBYTES → e-Arşiv (satış), ZIP içinde tek UBL fatura
 * Cari hareketteki BELGE_NO = FATIRS_NO. E-belge tablolarındaki CARI_KODU cari hareketten farklı tutulabildiği için
 * eşleşme belge no (+ yön) ile yapılır; birden fazla aday varsa cari kodu, vergi no ve tarih yakınlığıyla seçilir.
 */
export interface EDocument {
  source: 'efatura' | 'earsiv';
  direction: 'sales' | 'purchase';
  gibNo: string | null;
  uuid: string | null;
  date: Date | null;
  xml: string;
}

interface Candidate { src: 'F' | 'A'; ftirsip: string; gib: string | null; uuid: string | null; cari: string | null; vno: string | null; date: Date | null; direct: Buffer | null; data: Buffer | null }

/** Ekstre belgesinin XML'i var mı: e-Fatura (doğrudan veya zarfta) ya da e-Arşiv. */
const HAS_XML_EFATURA = `(DATALENGTH(f.XMLVERI) > 200 OR EXISTS (SELECT 1 FROM TBLEFATZARF z WITH (NOLOCK) WHERE z.ZARFID = f.ZARFID AND DATALENGTH(z.XMLBYTES) > 0))`;

/** "Faturamız" (bizim kestiğimiz) satış, "Faturanız" (bize kesilen) alış faturasıdır. */
export function invoiceDirection(description: string | null | undefined): 'sales' | 'purchase' | null {
  const d = (description ?? '').toLocaleUpperCase('tr-TR');
  if (d.startsWith('FATURAMIZ')) return 'sales';
  if (d.startsWith('FATURANIZ')) return 'purchase';
  return null;
}

@Injectable()
export class EDocumentService {
  constructor(private readonly netsis: NetsisClient) {}

  /** Ekstredeki belge numaralarından hangilerinin e-belge XML'i var (tek sorgu; Netsis erişilemezse boş). */
  async available(docNos: string[]): Promise<Set<string>> {
    const list = [...new Set(docNos.filter(Boolean))].slice(0, 500);
    if (!list.length || !this.netsis.configured) return new Set();
    const params = Object.fromEntries(list.map((d, i) => [`d${i}`, d]));
    const inList = list.map((_, i) => `@d${i}`).join(',');
    try {
      const rows = await this.netsis.query<{ d: string }>(
        `SELECT RTRIM(f.FATIRS_NO) AS d FROM TBLEFATURA f WITH (NOLOCK) WHERE RTRIM(f.FATIRS_NO) IN (${inList}) AND ${HAS_XML_EFATURA}
         UNION SELECT RTRIM(FATIRS_NO) FROM TBLEARSIV WITH (NOLOCK) WHERE RTRIM(FATIRS_NO) IN (${inList}) AND DATALENGTH(XMLBYTES) > 0`,
        params,
      );
      return new Set(rows.map((r) => r.d));
    } catch (e) {
      console.warn('e-belge varlık sorgusu başarısız', e instanceof Error ? e.message : e);
      return new Set();
    }
  }

  async get(docNo: string, opts: { direction: 'sales' | 'purchase' | null; customerCode: string; taxNo: string | null; date: Date }): Promise<EDocument> {
    if (!this.netsis.configured) throw new ServiceUnavailableException('Netsis bağlantısı yapılandırılmamış');
    const ftirsip = opts.direction === 'sales' ? '1' : opts.direction === 'purchase' ? '2' : null;
    const ft = ftirsip ? ' AND FTIRSIP = @ft' : '';
    const rows = await this.netsis.query<Candidate>(
      `SELECT 'F' AS src, f.FTIRSIP AS ftirsip, RTRIM(f.GIB_FATIRS_NO) AS gib, RTRIM(f.UUID) AS uuid, RTRIM(f.CARI_KODU) AS cari,
              RTRIM(f.SENDERVNO) AS vno, f.TARIH AS date,
              CASE WHEN DATALENGTH(f.XMLVERI) > 200 THEN CAST(CAST(f.XMLVERI AS varchar(max)) AS varbinary(max)) END AS direct,
              (SELECT TOP 1 z.XMLBYTES FROM TBLEFATZARF z WITH (NOLOCK) WHERE z.ZARFID = f.ZARFID AND DATALENGTH(z.XMLBYTES) > 0) AS data
       FROM TBLEFATURA f WITH (NOLOCK) WHERE RTRIM(f.FATIRS_NO) = @doc${ft.replace('FTIRSIP', 'f.FTIRSIP')}
       UNION ALL
       SELECT 'A', FTIRSIP, RTRIM(GIB_FATIRS_NO), RTRIM(UUID), RTRIM(CARI_KODU), NULL, TARIH, NULL, XMLBYTES
       FROM TBLEARSIV WITH (NOLOCK) WHERE RTRIM(FATIRS_NO) = @doc${ft}`,
      ftirsip ? { doc: docNo, ft: ftirsip } : { doc: docNo },
    );
    const withData = rows.filter((r) => r.direct?.length || r.data?.length);
    if (!withData.length) throw new NotFoundException('Bu belgenin e-fatura / e-arşiv XML kaydı bulunamadı');

    const score = (r: Candidate) =>
      (r.cari === opts.customerCode ? 4 : 0) + (opts.taxNo && r.vno === opts.taxNo ? 2 : 0)
      - (r.date ? Math.abs(r.date.getTime() - opts.date.getTime()) / 86_400_000 / 365 : 1);
    const best = withData.sort((a, b) => score(b) - score(a))[0];

    const xml = best.direct?.length ? decodeText(best.direct) : pickInvoice(unzipXml(best.data!), best.uuid, best.gib);
    if (!/<(\w+:)?Invoice[\s>]/.test(xml.slice(0, 4000))) throw new NotFoundException('Kayıttaki veri bir UBL e-fatura XML\'i değil');
    return {
      source: best.src === 'A' ? 'earsiv' : 'efatura',
      direction: best.ftirsip === '2' ? 'purchase' : 'sales',
      gibNo: best.gib, uuid: best.uuid, date: best.date, xml,
    };
  }
}

/**
 * GİB zarfından (StandardBusinessDocument) faturayı çıkarır: zarfta birden fazla Invoice olabilir, UUID (yoksa GİB no) eşleşeni alınır.
 * Üst öğelerde tanımlı ad alanları (xmlns) faturada yoksa eklenir; aksi halde çıkarılan XML ayrıştırılamaz.
 * Zarf değil düz UBL faturaysa olduğu gibi döner.
 */
function pickInvoice(xml: string, uuid: string | null, gibNo: string | null): string {
  const starts = [...xml.matchAll(/<((?:[\w.-]+:)?)Invoice[\s>]/g)];
  if (!starts.length) return xml;
  const root = (xml.replace(/^\uFEFF?\s*(<\?xml[^>]*\?>)?\s*/, '').match(/^<((?:[\w.-]+:)?)(\w+)/) ?? [])[2];
  if (root === 'Invoice') return xml;
  const parts = starts.map((m) => {
    const end = xml.indexOf(`</${m[1]}Invoice>`, m.index!);
    return { at: m.index!, text: end > 0 ? xml.slice(m.index!, end + `</${m[1]}Invoice>`.length) : '' };
  }).filter((p) => p.text);
  const pick = parts.find((p) => uuid && p.text.includes(`>${uuid}<`))
    ?? parts.find((p) => gibNo && p.text.includes(`>${gibNo}<`))
    ?? parts[0];
  if (!pick) return xml;
  // Atalardaki xmlns tanımlarını faturanın açılış etiketine taşı
  const openEnd = pick.text.indexOf('>');
  const open = pick.text.slice(0, openEnd);
  const inherited = new Map<string, string>();
  for (const m of xml.slice(0, pick.at).matchAll(/\s(xmlns(?::[\w.-]+)?)="([^"]*)"/g)) inherited.set(m[1], m[2]);
  const missing = [...inherited].filter(([k]) => !open.includes(` ${k}=`) && !open.includes(`\n${k}=`)).map(([k, v]) => ` ${k}="${v}"`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + open + missing + pick.text.slice(openEnd);
}

/** XMLVERI 'text' sütunu: genellikle UTF-8 bayt; değilse Netsis'in Türkçe kod sayfası (1254). */
function decodeText(buf: Buffer) {
  const body = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('windows-1254').decode(body);
  }
}

/** Tek dosyalık ZIP'ten .xml girdisini çıkarır (merkezi dizin üzerinden; veri tanımlayıcılı arşivlerde de çalışır). */
function unzipXml(zip: Buffer): string {
  if (zip.readUInt32LE(0) !== 0x04034b50) return decodeText(zip); // ZIP değil, düz XML
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP dizini bulunamadı');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  let fallback: Buffer | null = null;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = localOff + 30 + zip.readUInt16LE(localOff + 26) + zip.readUInt16LE(localOff + 28);
    const raw = zip.subarray(start, start + compSize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? raw : null;
    if (data && /\.xml$/i.test(name)) return decodeText(data);
    if (data && !fallback) fallback = data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (fallback) return decodeText(fallback);
  throw new Error('ZIP içinde XML bulunamadı');
}
