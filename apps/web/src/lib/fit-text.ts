/**
 * İstatistik kartlarındaki değerler ("8.161.095,18 ₺") kutuya sığmazsa yazı boyutu sığana kadar küçültülür
 * (en az MIN_PX). Kesmek ("2.500.000,…") bilgi kaybettirir; satır kırmak ₺'yi alta düşürür.
 * Sayfa değiştikçe (DOM) ve ekran boyutu değiştikçe yeniden ölçer; yalnızca taşan öğelere dokunur.
 */
const SELECTOR = '.stat b';
const MIN_PX = 12;

function fit(el: HTMLElement) {
  el.style.removeProperty('font-size');
  if (el.scrollWidth <= el.clientWidth + 1) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && size > MIN_PX) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

export function initFitText() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  let queued = 0;
  const run = () => {
    queued = 0;
    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) fit(el);
  };
  const schedule = () => { if (!queued) queued = requestAnimationFrame(run); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule);
  schedule();
}
