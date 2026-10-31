import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './Modal';

interface EDocument {
  source: 'efatura' | 'earsiv';
  direction: 'sales' | 'purchase';
  gibNo: string | null;
  uuid: string | null;
  date: string | null;
  docNo: string;
  customerName: string;
  xml: string;
}

const UBL = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
};

/** Faturaya gömülü GİB görüntüleme şablonu (XSLT): .xslt/.xsl adlı veya application/xml türündeki ek. */
function embeddedXslt(doc: Document): string | null {
  const objs = [...doc.getElementsByTagNameNS(UBL.cbc, 'EmbeddedDocumentBinaryObject')];
  const pick = objs.find((o) => /\.xslt?$/i.test(o.getAttribute('filename') ?? ''))
    ?? objs.find((o) => /xml|xsl/i.test(o.getAttribute('mimeCode') ?? '') && !/pdf/i.test(o.getAttribute('filename') ?? ''));
  if (!pick?.textContent) return null;
  const bin = atob(pick.textContent.replace(/\s+/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Şablonla HTML üretir; tarayıcı XSLT desteklemiyor veya şablon hatalıysa null. */
function renderWithXslt(xmlDoc: Document, xslt: string): string | null {
  if (typeof XSLTProcessor === 'undefined') return null;
  try {
    const style = new DOMParser().parseFromString(xslt, 'application/xml');
    if (style.getElementsByTagName('parsererror').length) return null;
    const proc = new XSLTProcessor();
    proc.importStylesheet(style);
    const out = proc.transformToDocument(xmlDoc);
    if (!out?.documentElement) return null;
    return '<!doctype html>' + new XMLSerializer().serializeToString(out);
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Şablon kullanılamazsa: UBL'den temel fatura görünümü (taraflar, satırlar, toplamlar). */
function fallbackHtml(doc: Document): string {
  const one = (el: Element | Document, path: string[]): string => {
    let cur: Element | Document | undefined = el;
    for (const seg of path) {
      const [ns, name] = seg.split(':') as [keyof typeof UBL, string];
      cur = cur ? [...(cur as Element).getElementsByTagNameNS(UBL[ns], name)][0] : undefined;
    }
    return (cur as Element | undefined)?.textContent?.trim() ?? '';
  };
  const party = (role: string) => {
    const p = [...doc.getElementsByTagNameNS(UBL.cac, role)][0];
    if (!p) return '';
    const name = one(p, ['cac:PartyName', 'cbc:Name']) || [one(p, ['cac:Person', 'cbc:FirstName']), one(p, ['cac:Person', 'cbc:FamilyName'])].join(' ');
    const ids = [...p.getElementsByTagNameNS(UBL.cac, 'PartyIdentification')].map((i) => {
      const id = i.getElementsByTagNameNS(UBL.cbc, 'ID')[0];
      return id ? `${id.getAttribute('schemeID') ?? ''} ${id.textContent}` : '';
    }).filter(Boolean).join(' · ');
    const addr = [one(p, ['cac:PostalAddress', 'cbc:StreetName']), one(p, ['cac:PostalAddress', 'cbc:CitySubdivisionName']), one(p, ['cac:PostalAddress', 'cbc:CityName'])].filter(Boolean).join(', ');
    const office = one(p, ['cac:PartyTaxScheme', 'cac:TaxScheme', 'cbc:Name']);
    return `<b>${esc(name)}</b><br>${esc(ids)}${office ? `<br>VD: ${esc(office)}` : ''}${addr ? `<br>${esc(addr)}` : ''}`;
  };
  const cur = (el: Element | undefined) => (el ? `${Number(el.textContent).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${el.getAttribute('currencyID') ?? ''}` : '');
  const lines = [...doc.getElementsByTagNameNS(UBL.cac, 'InvoiceLine')].map((l) => {
    const qty = l.getElementsByTagNameNS(UBL.cbc, 'InvoicedQuantity')[0];
    return `<tr><td>${esc(one(l, ['cac:Item', 'cbc:Name']))}</td><td class="n">${esc(qty?.textContent ?? '')} ${esc(qty?.getAttribute('unitCode') ?? '')}</td>`
      + `<td class="n">${cur(l.getElementsByTagNameNS(UBL.cac, 'Price')[0]?.getElementsByTagNameNS(UBL.cbc, 'PriceAmount')[0])}</td>`
      + `<td class="n">${cur([...l.children].find((c) => c.localName === 'LineExtensionAmount'))}</td></tr>`;
  }).join('');
  const total = [...doc.getElementsByTagNameNS(UBL.cac, 'LegalMonetaryTotal')][0];
  const amt = (n: string) => cur(total?.getElementsByTagNameNS(UBL.cbc, n)[0]);
  const taxTotal = [...doc.getElementsByTagNameNS(UBL.cac, 'TaxTotal')].find((t) => t.parentElement?.localName === 'Invoice');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}.meta{color:#555;margin-bottom:16px}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.parties div{border:1px solid #ddd;border-radius:8px;padding:10px}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:left}.n{text-align:right;white-space:nowrap}
    .tot{margin-left:auto;margin-top:12px;width:min(360px,100%)}.note{margin-top:18px;color:#777;font-size:12px}</style></head><body>
    <h1>${esc(one(doc, ['cbc:ProfileID']))} · ${esc(one(doc, ['cbc:InvoiceTypeCode']))} Fatura</h1>
    <div class="meta">No: <b>${esc(one(doc, ['cbc:ID']))}</b> · Tarih: ${esc(one(doc, ['cbc:IssueDate']))} · ETTN: ${esc(one(doc, ['cbc:UUID']))}</div>
    <div class="parties"><div><small>Satıcı</small><br>${party('AccountingSupplierParty')}</div><div><small>Alıcı</small><br>${party('AccountingCustomerParty')}</div></div>
    <table><thead><tr><th>Mal / hizmet</th><th class="n">Miktar</th><th class="n">Birim fiyat</th><th class="n">Tutar</th></tr></thead><tbody>${lines}</tbody></table>
    <table class="tot"><tr><td>Mal/hizmet toplamı</td><td class="n">${amt('LineExtensionAmount')}</td></tr>
    <tr><td>Hesaplanan vergiler</td><td class="n">${cur(taxTotal?.getElementsByTagNameNS(UBL.cbc, 'TaxAmount')[0])}</td></tr>
    <tr><td><b>Ödenecek tutar</b></td><td class="n"><b>${amt('PayableAmount')}</b></td></tr></table>
    <p class="note">Bu görünüm faturanın özetidir; faturada resmi görüntüleme şablonu bulunamadı veya tarayıcı desteklemiyor. Asıl belge için XML'i indirin.</p>
    </body></html>`;
}

/**
 * e-Fatura / e-Arşiv önizleme. Faturanın içindeki GİB XSLT şablonuyla resmi görünüm üretilir; çıktı betik çalıştıramayan
 * (sandbox) bir çerçevede gösterilir — tedarikçiden gelen belgeler de güvenle açılır. Yazdırılabilir, XML indirilebilir.
 */
export function EDocumentPreview({ customerCode, docNo, onClose }: { customerCode: string; docNo: string; onClose(): void }) {
  const [doc, setDoc] = useState<EDocument | null>(null);
  const [html, setHtml] = useState('');
  const [mode, setMode] = useState<'xslt' | 'ozet' | null>(null);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let alive = true;
    api<EDocument>(`/erp/customers/${encodeURIComponent(customerCode)}/edocs/${encodeURIComponent(docNo)}`)
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        const xmlDoc = new DOMParser().parseFromString(d.xml, 'application/xml');
        if (xmlDoc.getElementsByTagName('parsererror').length) { setError('Fatura XML\'i okunamadı'); return; }
        const xslt = embeddedXslt(xmlDoc);
        const viaXslt = xslt ? renderWithXslt(xmlDoc, xslt) : null;
        setHtml(viaXslt ?? fallbackHtml(xmlDoc));
        setMode(viaXslt ? 'xslt' : 'ozet');
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Belge açılamadı'));
    return () => { alive = false; };
  }, [customerCode, docNo]);

  const download = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.xml], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${doc.gibNo ?? doc.docNo}.xml`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => frame.current?.contentWindow?.print();
  /** A4 fatura dar ekrana sığmıyorsa çerçeve genişliğine ölçeklenir (çerçeve içinde parmakla yakınlaştırma yok). */
  const fitToFrame = () => {
    const d = frame.current?.contentDocument;
    if (!d?.body) return;
    d.body.style.removeProperty('zoom');
    const scale = d.documentElement.clientWidth / d.documentElement.scrollWidth;
    if (scale < 0.98) d.body.style.setProperty('zoom', String(Math.max(0.35, scale)));
  };

  const title = doc
    ? `${doc.source === 'earsiv' ? 'e-Arşiv' : 'e-Fatura'} · ${doc.direction === 'sales' ? 'Faturamız' : 'Faturanız'} · ${doc.gibNo ?? doc.docNo}`
    : `e-Belge · ${docNo}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="edoc">
        {error && <p className="error">{error}</p>}
        {!error && !html && <p className="empty">Belge yükleniyor…</p>}
        {html && (
          <>
            <div className="edoc-bar">
              <small className="muted">{doc?.customerName}{mode === 'ozet' && ' · özet görünüm (resmi şablon yok)'}</small>
              <span className="push" />
              <button className="btn sm" onClick={print}><Printer size={14} /> Yazdır</button>
              <button className="btn sm" onClick={download}><Download size={14} /> XML</button>
            </div>
            {/* allow-same-origin: yazdırma için; allow-scripts YOK: belgedeki betikler çalışmaz */}
            <iframe ref={frame} className="edoc-frame" title={title} sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={fitToFrame} />
          </>
        )}
      </div>
    </Modal>
  );
}
