/**
 * Arayüz efekti (tek sefer kurulur, React ağacından bağımsız):
 * düğme, menü öğesi ve çiplere dokununca ana renkte yayılan halka (app.css .ripple).
 * Hareket azaltma tercihi açıksa çalışmaz.
 */
const RIPPLE_TARGETS = '.btn, .nav-item, .seg button, .icon-btn, .tk-chip, .tab, .chip, .sheet-item, .hm-quick a';

export function initEffects() {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
