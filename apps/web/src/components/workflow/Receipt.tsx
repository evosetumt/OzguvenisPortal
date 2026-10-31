import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { fileUrl, openFile } from '../../lib/files';
import type { FileRef } from '../../lib/types-workflow';

/** Fiş küçük resmi: görseller yetkili istekle alınıp gösterilir, diğer dosyalar simgeyle. Tıklayınca uygulama içindeki görüntüleyicide açılır. */
export function Receipt({ file, onRemove }: { file: FileRef; onRemove?(): void }) {
  const [src, setSrc] = useState<string | null>(null);
  const isImage = file.mime.startsWith('image/') && file.mime !== 'image/heic';

  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let alive = true;
    fileUrl(file.id).then((u) => { url = u; if (alive) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file.id, isImage]);

  return (
    <div className="receipt" role="button" tabIndex={0} title={file.fileName}
      onClick={() => void openFile(file.id, file.fileName)} onKeyDown={(e) => e.key === 'Enter' && void openFile(file.id, file.fileName)}>
      {isImage && src ? <img src={src} alt={file.fileName} /> : (
        <span className="receipt-doc"><FileText size={22} />{file.fileName.slice(0, 18)}</span>
      )}
      {onRemove && (
        <button type="button" className="rm" title="Kaldır" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={12} /></button>
      )}
    </div>
  );
}
