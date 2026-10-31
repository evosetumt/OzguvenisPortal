import { useEffect, useState } from 'react';
import { Download, Minus, Plus, RotateCw, X } from 'lucide-react';
import { fileBlob, PREVIEW_EVENT, type PreviewRequest } from '../lib/files';

interface Loaded { url: string; type: string; name: string }

/** Uygulama içi dosya görüntüleyici: görsel (yakınlaştır/döndür), PDF; diğer türler için indirme. Shell'de bir kez bulunur. */
export function FilePreview() {
  const [req, setReq] = useState<PreviewRequest | null>(null);
  const [file, setFile] = useState<Loaded | null>(null);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);

  useEffect(() => {
    const on = (e: Event) => { setReq((e as CustomEvent<PreviewRequest>).detail); setZoom(1); setRot(0); };
    window.addEventListener(PREVIEW_EVENT, on);
    return () => window.removeEventListener(PREVIEW_EVENT, on);
  }, []);

  useEffect(() => {
    if (!req) return;
    let url = '';
    let alive = true;
    setFile(null); setErr('');
    fileBlob(req.id)
      .then(({ blob, name }) => {
        url = URL.createObjectURL(blob);
        if (alive) setFile({ url, type: blob.type, name: req.name ?? name ?? `dosya-${req.id}` });
        else URL.revokeObjectURL(url);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : 'Dosya açılamadı'));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setReq(null); }
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  const isImage = file?.type.startsWith('image/');
  const isPdf = file?.type === 'application/pdf';
  return (
    <div className="fp-overlay" onMouseDown={(e) => e.target === e.currentTarget && setReq(null)} role="dialog" aria-modal="true" aria-label="Dosya önizleme">
      <header className="fp-bar">
        <b title={file?.name}>{file?.name ?? req.name ?? 'Yükleniyor…'}</b>
        <span className="fp-tools">
          {isImage && (
            <>
              <button className="icon-btn" title="Uzaklaştır (-)" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><Minus size={18} /></button>
              <span className="fp-zoom">%{Math.round(zoom * 100)}</span>
              <button className="icon-btn" title="Yakınlaştır (+)" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><Plus size={18} /></button>
              <button className="icon-btn" title="Döndür" onClick={() => setRot((r) => (r + 90) % 360)}><RotateCw size={18} /></button>
            </>
          )}
          {file && <a className="icon-btn" title="İndir" href={file.url} download={file.name}><Download size={18} /></a>}
          <button className="icon-btn" title="Kapat (Esc)" onClick={() => setReq(null)}><X size={20} /></button>
        </span>
      </header>
      <div className="fp-stage" onMouseDown={(e) => e.target === e.currentTarget && setReq(null)}>
        {err && <p className="fp-msg">{err}</p>}
        {!file && !err && <p className="fp-msg">Yükleniyor…</p>}
        {isImage && (
          <img src={file!.url} alt={file!.name} draggable={false} onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
            style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }} />
        )}
        {isPdf && <iframe src={file!.url} title={file!.name} />}
        {file && !isImage && !isPdf && (
          <div className="fp-msg">
            <p>Bu dosya türü için önizleme yok.</p>
            <a className="btn primary" href={file.url} download={file.name}><Download size={16} /> İndir</a>
          </div>
        )}
      </div>
    </div>
  );
}
