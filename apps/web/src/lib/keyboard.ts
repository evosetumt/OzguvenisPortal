/**
 * Telefon klavyesi: iOS Safari'de (ve Android'de varsayılan olarak) klavye açılınca sayfa yüksekliği küçülmez,
 * klavye içeriğin üstüne biner — sohbetin yazma kutusu klavyenin altında kalıyordu.
 * Görünür alan (visualViewport) ölçülür:
 *   --vvh       : klavyenin (ve üstündeki otomatik doldurma çubuğunun) üstünde kalan görünür yükseklik (px)
 *   html.kb-open: klavye açık → alt menü çubuğu gizlenir, sohbet bu alana sığdırılır
 *
 * Klavye algılama: iOS'ta window.innerHeight de görünür alanla birlikte küçüldüğü için ikisini karşılaştırmak işe
 * yaramaz (menü çubuğu yazma kutusunun üstüne biniyordu). Bunun yerine: dokunmatik cihazda bir yazı alanı odaktaysa
 * klavye açık sayılır; ayrıca yazı yazılmıyorken görülen en büyük yüksekliğe göre belirgin küçülme de klavyedir.
 */
const KEYBOARD_MIN_PX = 120; // bundan küçük farklar adres çubuğu oynamasıdır, klavye değil

export function initKeyboardTracking() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  const root = document.documentElement;
  const touch = window.matchMedia('(pointer: coarse)');
  let fullHeight = vv.height; // klavyesiz görünür yükseklik
  let frame = 0;
  const update = () => {
    frame = 0;
    const typing = isTyping();
    if (!typing) fullHeight = vv.height; // dönme / adres çubuğu değişimlerinde tabanı güncelle
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    const open = typing && (touch.matches || fullHeight - vv.height > KEYBOARD_MIN_PX);
    root.classList.toggle('kb-open', open);
    // iOS klavye açılınca sayfayı kaydırır; içerik görünür alana sığdırıldığı için başa sabitlenir.
    if (open && window.scrollY > 0 && document.querySelector('.chat')) window.scrollTo(0, 0);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 300));
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', () => setTimeout(schedule, 50));
  update();
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes((el as HTMLInputElement).type)));
}
