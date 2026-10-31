import { ApiError, getToken } from './api';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface UploadedFile { id: number; fileName: string; mime: string; size: number; createdAt: string }

/** Dosyayı /api/attachments'a yükler; dönen id ilgili kayda (masraf, sözleşme, mesaj) bağlanır. */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append('file', file);
  const token = getToken();
  const res = await fetch(`${BASE}/api/attachments`, {
    method: 'POST',
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = 'Dosya yüklenemedi';
    try { msg = (await res.json()).message ?? msg; } catch { /* gövde yok */ }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

/** Yetkili istekle dosyayı alır ve geçici bir blob adresi döner (img src veya yeni sekme için). Kullanınca URL.revokeObjectURL çağırın. */
export async function fileUrl(id: number): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE}/api/attachments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Dosya açılamadı');
  return URL.createObjectURL(await res.blob());
}

/** Dosyayı ve sunucunun verdiği dosya adını getirir (uygulama içi görüntüleyici için). */
export async function fileBlob(id: number): Promise<{ blob: Blob; name: string | null }> {
  const token = getToken();
  const res = await fetch(`${BASE}/api/attachments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Dosya açılamadı');
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  return { blob: await res.blob(), name: m ? decodeURIComponent(m[1]) : null };
}

export const PREVIEW_EVENT = 'ozg:file-preview';
export interface PreviewRequest { id: number; name?: string }

/** Dosyayı yeni sekmede değil, uygulama içindeki görüntüleyicide açar (Shell'deki FilePreview dinler). */
export async function openFile(id: number, name?: string) {
  window.dispatchEvent(new CustomEvent<PreviewRequest>(PREVIEW_EVENT, { detail: { id, name } }));
}

export const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
