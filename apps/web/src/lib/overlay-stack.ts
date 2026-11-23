import { useEffect, useRef } from 'react';

/**
 * Açık pencereler (modal, çekmece, dosya önizleme, menü sayfası) yığını.
 * Esc ve Android geri tuşu yalnızca EN ÜSTTEKİ pencereyi kapatır; alttaki pencere ve sayfa yerinde kalır.
 * (Önceden her pencere kendi Esc dinleyicisini kuruyordu: geri tuşu ise önizleme açıkken bile sayfayı geri götürüyordu.)
 */
type Closer = () => void;
interface Entry { id: number; close: Closer }

const stack: Entry[] = [];
let seq = 0;

/** Pencereyi yığına ekler; dönen işlev çıkarır. */
export function pushOverlay(close: Closer): () => void {
  const entry: Entry = { id: ++seq, close };
  stack.push(entry);
  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** En üstteki pencereyi kapatır. Açık pencere yoksa false döner (geri tuşu o zaman sayfada geri gider). */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function overlayCount() {
  return stack.length;
}

let keyListening = false;
function listenEscape() {
  if (keyListening || typeof window === 'undefined') return;
  keyListening = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !stack.length) return;
    e.preventDefault();
    e.stopPropagation();
    closeTopOverlay();
  }, true);
}

/** Bileşen açıkken (active) pencereyi yığına koyar; onClose her çizimde güncel tutulur. */
export function useOverlay(onClose: Closer, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    listenEscape();
    return pushOverlay(() => ref.current());
  }, [active]);
}
