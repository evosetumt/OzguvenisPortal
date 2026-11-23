# Plan: Arayüz yeniden tasarımı (Yemeksepeti tarzı, B2B renkleri, çoklu tema)

Branch: `feat/ui-redesign` · Taban: `main` (62b471a)

## Hedef
- Yerleşim/etkileşim dili Yemeksepeti tarzı: düz (cam efekti yok), beyaz kartlar, yumuşak gölge,
  büyük yuvarlatılmış köşeler, kalın başlıklar, yatay kaydırılan "chip" kategoriler ve kart şeritleri,
  mobilde alt sekme çubuğu + üstte arama, renkli kampanya/özet afişi (hero).
- Renkler: b2b.ozguvenis.com.tr ile aynı palet (aşağıda).
- Açık / koyu / otomatik mod + birden fazla renk teması (her biri açık ve koyu).

## B2B paleti (bayi portalı CSS'inden alındı: /bayi/assets/index-*.css)
| Rol | Açık | Koyu |
|---|---|---|
| accent (altın) | `#85713b` (yazı `#fff`) | `#c2ac6b` (yazı `#25231e`) |
| background | `#f7f7f7` | `#141311` |
| surface | `#fff` | `#1d1b18` |
| surface-2 / -3 | `#f1f1f1` / `#e9e9e9` | `#26241f` / `#302d27` |
| foreground | `#323232` | `#ececea` |
| muted | `#6a6a6a` | `#a39e91` |
| border / separator | `#dadada` / `#e6e6e6` | `#38352e` / `#2c2a25` |
| gold / light / soft | `#968046` / `#c2ac6b` / `#f4efe1` | `#b39a56` / – / `#2d2819` |
| ink (koyu şerit) | `#25231e`, `#413e35` | – |
| success / warning / danger | oklch(53% .13 158) / oklch(76% .14 72) / oklch(58% .19 26) | oklch(74% .15 158) / oklch(82% .14 76) / oklch(70% .17 25) |
| chart 1–5 | `#a07d17 #2a78d6 #1baf7a #6250d6 #eb6834` | `#d9b04a #5aa2f0 #3ecf99 #9a8cf5 #f48a5c` |
| theme-color meta | `#85713b` | `#141311` |

Köşe yarıçapı B2B'de 4px; Yemeksepeti hissi için kartlarda 16px, düğme/chip'te tam yuvarlak (pill) kullanılacak.

## Tema sistemi
- `<html data-theme="light|dark" data-palette="ozguvenis|okyanus|orman|gunbatimi|grafit">`
- Varsayılan palet `ozguvenis` (B2B altını). Diğerleri yalnızca accent/accent-soft/hero renklerini değiştirir;
  nötr yüzeyler ortak kalır → bakım kolay.
- `data-wallpaper` ve cam (glass/lens/gel/rim/depth) belirteçleri kaldırılır. Eski `accent` tercihi
  yeni `palette`'e eşlenir (mavi→okyanus, yeşil→orman, turuncu/pembe→gunbatimi, grafit→grafit, diğer→ozguvenis).
- Sunucudaki `ui` JSON'u aynı alanda kalır (`{theme, palette}`); API değişikliği yok.

## Aşamalar
1. **Belirteçler** — `styles/theme.css` yeniden yazılır: yeni semantik değişkenler (`--bg --surface --surface-2 --fg
   --muted --border --accent --accent-fg --accent-soft --success --warning --danger --radius-* --shadow-card`).
   Eski adlar (`--glass-solid`, `--glass`, `--text-2`, `--sep` …) yeni değerlere takma ad olarak bağlanır →
   modül CSS'leri ilk günden bozulmadan çalışır. `appearance.css` paletlere dönüşür.
2. **Tema mantığı** — `lib/theme.ts`: `PALETTES`, `palette` tercihi, geçiş/eşleme, `theme-color` meta güncelleme.
   `index.html`'e ilk boyamadan önce çalışan küçük init betiği (B2B'deki gibi, titreme olmasın).
   Birim testi: geçiş eşlemesi ve çözümleme.
3. **Kabuk (Shell)** — masaüstü: sade beyaz yan menü (aktif öğe altın dolgu pill), üstte geniş arama çubuğu.
   Mobil: üst çubukta selam + arama, alt sekme çubuğu (5 sekme, ortada belirgin "+" hızlı görev),
   "Tümü" sayfası ızgara kartlar. Cam/lens animasyonu kaldırılır.
4. **Ortak bileşenler** — `components.css`: kart, pill düğme, chip şeridi, bölüm başlığı ("Tümünü gör ›"),
   liste satırı, rozet, boş durum, iskelet yükleyici; Modal/Drawer mobilde alttan açılan sayfa (bottom sheet).
5. **Ana sayfa** — hero afiş (altın degrade, günün özeti), yatay chip kısayollar, yatay kaydırılan kart şeritleri
   (bugünkü görevler, onay bekleyenler, son mesajlar).
6. **Modül sayfaları** — Görevler, Takvim, Mesajlar, Akış, Ekip, Onaylar, Analiz, Sipariş, Cari, Masraf,
   Süre Takibi, Akış Tasarımcısı, Ayarlar: sayfa başına CSS uyarlaması; JSX'e yalnızca gerekli sınıf değişiklikleri.
   Analiz grafikleri B2B chart renklerine geçer.
7. **Ayarlar → Görünüm** — Açık/Koyu/Otomatik segment + palet kartları (önizlemeli).
8. **Giriş ekranı, Android/iOS** — `manifest.webmanifest` / `theme-color` / Capacitor status bar rengi temaya uyar.
9. **Doğrulama** — `npm run build`, tarayıcıda 375px ve 1440px, her palet × açık/koyu ekran görüntüsü,
   kontrast (WCAG AA) kontrolü, ardından code-review ve PR.

## Riskler
- 2.2k satır modül CSS'i cam değişkenlerine bağlı → aşama 1'deki takma adlarla kademeli geçiş.
- `#85713b` üstünde beyaz yazı kontrastı ~4.6:1 (AA sınırında) → küçük metinde altın zemin yerine altın yazı/çerçeve.
- Büyük PR (>20 dosya) → aşama başına ayrı commit; istenirse 2 PR'a bölünebilir (1–4 altyapı, 5–8 sayfalar).

## Kapsam dışı
- API/veri değişikliği, yeni özellik, Yemeksepeti marka öğeleri (logo, pembe renk, maskot) — yalnızca yerleşim dili alınır.
