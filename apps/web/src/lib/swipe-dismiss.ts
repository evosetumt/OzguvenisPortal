import { closeTopOverlay } from './overlay-stack';

/**
 * Telefonda alttan açılan pencereler (modal, çekmece) aşağı kaydırılarak kapatılır; sağ üstteki çarpı da çalışmaya devam eder.
 * Tek bir belge dinleyicisi tüm pencerelere uygulanır (her pencereye ayrı kod gerekmez):
 *  - Parmak pencerenin içinde ve kaydırılabilir içerik en üstteyken aşağı çekilirse pencere parmağı izler,
 *  - eşik aşılırsa (veya hızlı fırlatılırsa) en üstteki pencere kapanır (overlay-stack), aksi hâlde yerine döner.
 */
const PANEL = '.overlay > .modal, .drawer-overlay > .drawer';
const MOBILE = '(max-width: 860px)';
/** Sürüklemenin başladığı sayılması için en az dikey hareket (px) */
const START_PX = 8;
/** Kapatma eşiği: pencere yüksekliğinin oranı veya en az bu kadar piksel */
const CLOSE_RATIO = 0.25;
const CLOSE_MIN_PX = 90;
/** Hızlı fırlatma (px/ms) kısa mesafede de kapatır */
const FLING_SPEED = 0.6;
const SNAP_MS = 220;

interface Drag { panel: HTMLElement; startX: number; startY: number; startT: number; dy: number; active: boolean }

let drag: Drag | null = null;

/** Dokunulan noktadan pencereye kadar kaydırılmış (en üstte olmayan) bir alan varsa sürükleme içeriği kaydırmalıdır. */
function scrolledAbove(target: Element, panel: HTMLElement): boolean {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
    if (el === panel) break;
  }
  return false;
}

const isField = (el: Element) => !!el.closest('input, textarea, select, [contenteditable="true"], .no-swipe');

function reset(panel: HTMLElement, animate: boolean) {
  panel.style.transition = animate ? `transform ${SNAP_MS}ms ease` : '';
  panel.style.transform = '';
  if (animate) window.setTimeout(() => { panel.style.transition = ''; panel.style.animation = ''; }, SNAP_MS);
  else panel.style.animation = '';
}

function onStart(e: TouchEvent) {
  drag = null;
  if (e.touches.length !== 1 || !window.matchMedia(MOBILE).matches) return;
  const target = e.target as Element | null;
  const panel = target?.closest<HTMLElement>(PANEL);
  if (!target || !panel || isField(target) || scrolledAbove(target, panel)) return;
  const t = e.touches[0];
  drag = { panel, startX: t.clientX, startY: t.clientY, startT: Date.now(), dy: 0, active: false };
}

function onMove(e: TouchEvent) {
  if (!drag) return;
  const t = e.touches[0];
  const dy = t.clientY - drag.startY;
  const dx = t.clientX - drag.startX;
  if (!drag.active) {
    // Yukarı veya yatay hareket: içerik kaydırması, pencere sürüklenmez
    if (dy < START_PX || Math.abs(dx) > dy) { if (Math.abs(dy) > START_PX || Math.abs(dx) > START_PX) drag = null; return; }
    drag.active = true;
    drag.panel.style.animation = 'none'; // açılış animasyonunun son karesi transform'u ezmesin
    drag.panel.style.transition = 'none';
  }
  e.preventDefault();
  drag.dy = Math.max(0, dy);
  drag.panel.style.transform = `translateY(${drag.dy}px)`;
}

function onEnd() {
  const d = drag;
  drag = null;
  if (!d?.active) return;
  const speed = d.dy / Math.max(1, Date.now() - d.startT);
  const threshold = Math.max(CLOSE_MIN_PX, d.panel.offsetHeight * CLOSE_RATIO);
  if (d.dy > threshold || (speed > FLING_SPEED && d.dy > START_PX * 3)) {
    d.panel.style.transition = `transform ${SNAP_MS}ms ease`;
    d.panel.style.transform = 'translateY(100%)';
    window.setTimeout(() => { if (d.panel.isConnected) { closeTopOverlay(); reset(d.panel, false); } }, SNAP_MS);
  } else {
    reset(d.panel, true);
  }
}

let installed = false;

/** Uygulama açılışında bir kez çağrılır. */
export function installSwipeDismiss(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', onEnd, { passive: true });
}
