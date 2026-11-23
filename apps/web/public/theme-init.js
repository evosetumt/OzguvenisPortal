// Görünüm modunu ve renk temasını React yüklenmeden, ilk boyamadan önce uygular (titreme olmasın).
// Mantık src/lib/palette.ts (normalizePrefs, resolveTheme, chromeColor) ile aynıdır; değiştirirken ikisini birlikte güncelleyin.
// Harici dosya: satır içi betik CSP ile engellenebilir.
(function () {
  var PALETTES = ['ozguvenis', 'okyanus', 'orman', 'gunbatimi', 'grafit'];
  var ACCENT_TO_PALETTE = { mor: 'okyanus', yesil: 'orman', turuncu: 'gunbatimi', pembe: 'gunbatimi', grafit: 'grafit', altin: 'ozguvenis' };
  var p = {};
  try {
    var raw = localStorage.getItem('ozg-ui');
    if (raw) p = JSON.parse(raw) || {};
    else p = { theme: localStorage.getItem('ozg-theme') }; // eski tek anahtarlı kayıt (lib/theme.ts readCache ile aynı)
  } catch (e) { /* depolama yok veya bozuk */ }
  var pref = p.theme === 'light' || p.theme === 'dark' ? p.theme : 'auto';
  var light = pref === 'light' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  var palette = PALETTES.indexOf(p.palette) >= 0 ? p.palette : ACCENT_TO_PALETTE[p.accent] || 'ozguvenis';
  var r = document.documentElement;
  r.setAttribute('data-theme', light ? 'light' : 'dark');
  r.setAttribute('data-palette', palette);
  r.style.colorScheme = light ? 'light' : 'dark';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#f7f7f7' : '#141311');
})();
