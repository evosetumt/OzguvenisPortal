import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Paperclip } from 'lucide-react';
import { uploadFile } from '../lib/files';
import type { FileRef } from '../lib/types-workflow';
import { Receipt } from './workflow/Receipt';
import '../styles/workflow.css';

type Props = {
  files: FileRef[];
  /** Yüklenen dosyalar kayda bağlanır (görev: POST /tasks/:id/files, form: yerel listeye eklenir). */
  onAdd(files: FileRef[]): Promise<unknown> | void;
  onRemove?(file: FileRef): void;
  canAdd?: boolean;
  canRemove?(file: FileRef): boolean;
};

const ANY_FILE = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';

/**
 * Ek listesi + "Dosya ekle" ve "Fotoğraf çek" düğmeleri. Fotoğraf çek telefonda doğrudan kamerayı açar
 * (capture=environment; Android uygulamasında kamera izni manifestte var), masaüstünde dosya seçtirir.
 */
export function AttachmentPicker({ files, onAdd, onRemove, canAdd = true, canRemove = () => true }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    setBusy(true); setErr('');
    try {
      const uploaded: FileRef[] = [];
      for (const f of picked) uploaded.push(await uploadFile(f));
      await onAdd(uploaded);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Dosya eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="att-picker">
      {files.length > 0 && (
        <div className="receipts">
          {files.map((f) => (
            <Receipt key={f.id} file={f} onRemove={onRemove && canRemove(f) ? () => onRemove(f) : undefined} />
          ))}
        </div>
      )}
      {canAdd && (
        <div className="att-actions">
          <button type="button" className="btn sm" disabled={busy} onClick={() => cameraInput.current?.click()}>
            <Camera size={16} /><span>Fotoğraf çek</span>
          </button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Paperclip size={16} /><span>{busy ? 'Yükleniyor…' : 'Dosya ekle'}</span>
          </button>
          <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => void handleFiles(e)} />
          <input ref={fileInput} type="file" hidden multiple accept={ANY_FILE} onChange={(e) => void handleFiles(e)} />
        </div>
      )}
      {!canAdd && files.length === 0 && <p className="muted att-empty">Ek yok</p>}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
