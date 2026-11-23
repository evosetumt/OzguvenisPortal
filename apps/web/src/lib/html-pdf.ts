/**
 * Bir HTML belgeyi (ör. GİB şablonuyla üretilmiş fatura) A4 PDF'e çevirir. Kütüphaneler yalnızca ilk kullanımda yüklenir.
 * Belge, betik çalıştıramayan (sandbox) gizli bir çerçevede A4 genişliğinde dizilir ve görüntüsü alınır;
 * tedarikçiden gelen faturalardaki betikler çalışmaz.
 */
const A4_WIDTH_PX = 794; // 210 mm @ 96 dpi
const RENDER_SCALE = 2;

function loadSandboxed(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:1123px;border:0;visibility:hidden`;
    f.onload = () => resolve(f);
    f.onerror = () => reject(new Error('Belge hazırlanamadı'));
    f.srcdoc = html;
    document.body.appendChild(f);
  });
}

export async function htmlToPdf(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const frame = await loadSandboxed(html);
  try {
    const doc = frame.contentDocument;
    if (!doc?.documentElement) throw new Error('Belge hazırlanamadı');
    const width = Math.max(A4_WIDTH_PX, doc.documentElement.scrollWidth);
    const canvas = await html2canvas(doc.body, {
      scale: RENDER_SCALE, backgroundColor: '#ffffff', logging: false, width, windowWidth: width,
      height: doc.documentElement.scrollHeight, windowHeight: doc.documentElement.scrollHeight,
    });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const sliceH = Math.floor((canvas.width * pageH) / pageW); // bir sayfaya sığan tuval yüksekliği
    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('PDF oluşturulamadı');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pageW, (h * pageW) / canvas.width);
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}
