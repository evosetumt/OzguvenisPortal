/**
 * Arayüz efektleri (tek sefer kurulur, React ağacından bağımsız):
 * - Parlama: imleç altındaki .glass yüzeyde --gx/--gy ile yumuşak ışık (app.css radial-gradient).
 * - Dalga: düğme ve menü öğelerine dokununca yayılan halka.
 * Hareket azaltma tercihi açıksa hiçbiri çalışmaz; dokunmatikte parlama kapalıdır.
 */
const RIPPLE_TARGETS = '.btn, .nav-item, .seg button, .icon-btn, .tk-chip, .tab, .chip';

export function initEffects() {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let lit: HTMLElement | null = null;
  let frame = 0;
  const clear = () => {
    if (!lit) return;
    lit.style.removeProperty('--gx');
    lit.style.removeProperty('--gy');
    lit = null;
  };
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = (e.target as Element | null)?.closest?.<HTMLElement>('.glass') ?? null;
        if (el !== lit) clear();
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${e.clientX - r.left}px`);
        el.style.setProperty('--gy', `${e.clientY - r.top}px`);
        lit = el;
      });
    }, { passive: true });
    document.addEventListener('pointerleave', clear);
  }

  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(RIPPLE_TARGETS);
    if (!el || (el as HTMLButtonElement).disabled) return;
    const r = el.getBoundingClientRect();
    const wrap = document.createElement('span');
    wrap.className = 'ripple-wrap';
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.left = `${e.clientX - r.left}px`;
    dot.style.top = `${e.clientY - r.top}px`;
    dot.style.setProperty('--rs', String((Math.max(r.width, r.height) / 20) * 2.4));
    wrap.appendChild(dot);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(wrap);
    dot.addEventListener('animationend', () => wrap.remove());
  }, { passive: true });
}

/** Kayan seçim göstergesi: kapsayıcı içindeki aktif öğenin konumuna lens'i taşır. */
export function placeLens(container: HTMLElement | null, lens: HTMLElement | null, active: HTMLElement | null) {
  if (!container || !lens) return;
  if (!active) { lens.style.opacity = '0'; return; }
  const c = container.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  lens.style.opacity = '1';
  lens.style.transform = `translate(${a.left - c.left + container.scrollLeft}px, ${a.top - c.top + container.scrollTop}px)`;
  lens.style.width = `${a.width}px`;
  lens.style.height = `${a.height}px`;
}
