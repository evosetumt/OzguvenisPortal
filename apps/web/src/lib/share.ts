import { Capacitor, registerPlugin } from '@capacitor/core';

/** Android'deki yerel eklenti (android/.../FileCachePlugin.java): dosyayı önbelleğe yazar, file:// adresini döner. */
interface FileCachePlugin { write(opts: { name: string; data: string }): Promise<{ uri: string }> }
const FileCache = registerPlugin<FileCachePlugin>('FileCache');

/**
 * Dosyayı cihazın paylaşım menüsüyle paylaşır (WhatsApp, e-posta, Drive, Bluetooth ...).
 * - Android uygulaması: dosya önbelleğe yazılır (FileCache yerel eklentisi), yerel paylaşım sayfası açılır (@capacitor/share).
 *   iOS uygulaması: WKWebView Web Share API ile dosya paylaşabildiği için aşağıdaki tarayıcı yolu kullanılır.
 * - Tarayıcı: Web Share API dosya paylaşımını destekliyorsa (Android Chrome, iOS Safari, Windows Edge) o kullanılır.
 * - Desteklemeyen tarayıcı (ör. masaüstü Firefox): dosya indirilir.
 */
export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Dosya adında işletim sistemlerinin kabul etmediği karakterleri temizler. */
export function safeFileName(name: string, fallback = 'belge'): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '');
  return clean.slice(0, 120) || fallback;
}

/** Kullanıcı paylaşım menüsünü kapattı mı (hata sayılmaz)? */
export function isShareCancel(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /cancel|iptal|abort/i.test(msg);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('Dosya okunamadı'));
    r.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareFile(blob: Blob, fileName: string, title: string, text?: string): Promise<ShareResult> {
  const name = safeFileName(fileName);
  if (Capacitor.getPlatform() === 'android') {
    const { Share } = await import('@capacitor/share');
    const { uri } = await FileCache.write({ name, data: await blobToBase64(blob) });
    try {
      await Share.share({ title, text, files: [uri], dialogTitle: title });
      return 'shared';
    } catch (e) {
      if (isShareCancel(e)) return 'cancelled';
      throw e;
    }
  }
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (e) {
      if (isShareCancel(e)) return 'cancelled';
      throw e;
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
