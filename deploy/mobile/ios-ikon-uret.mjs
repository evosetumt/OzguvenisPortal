// iOS uygulama ikonu (1024x1024) ve açılış ekranı (2732x2732) üretir; tasarım deploy/ikon-uret.mjs ile aynı (mavi zeminde beyaz "Ö").
// App Store ikonu saydamlık (alfa kanalı) içeremez: PNG'ler RGB (renk tipi 2) yazılır.
// Kullanım (proje kökünde): node deploy/mobile/ios-ikon-uret.mjs  → apps/web/ios/App/App/Assets.xcassets/...
import { deflateSync } from 'node:zlib';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'ios', 'App', 'App', 'Assets.xcassets');
if (!existsSync(assets)) throw new Error(`iOS projesi yok: ${assets} (önce apps/web içinde: npx cap add ios)`);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

const BLUE = [37, 99, 235], WHITE = [255, 255, 255];

/** Harf (halka + iki nokta) içinde mi? u,v: ikon karesinde 0..1, scale: harfin kareye oranı. */
function inGlyph(u, v, scale) {
  const px = (u - 0.5) / scale, py = (v - 0.5) / scale;
  const ry = (py - 0.08) / 1.12;
  const d = Math.hypot(px, ry);
  return (d < 0.27 && d > 0.165) || Math.hypot(px + 0.11, py + 0.32) < 0.055 || Math.hypot(px - 0.11, py + 0.32) < 0.055;
}

/**
 * size: PNG kenarı. box: ortadaki ikon karesinin kenarı (piksel). Kare dışı pageBg; kare içi mavi zemin + beyaz harf.
 * rounded: kare köşeleri yuvarlatılsın mı (açılış ekranı için; uygulama ikonunu iOS kendisi yuvarlatır).
 */
function png(size, box, pageBg, rounded) {
  const S = 3;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const x0 = (size - box) / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const o = row + 1 + x * 3;
      if (x < x0 - 1 || x > x0 + box + 1 || y < x0 - 1 || y > x0 + box + 1) { raw[o] = pageBg[0]; raw[o + 1] = pageBg[1]; raw[o + 2] = pageBg[2]; continue; }
      let bg = 0, fg = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S - x0) / box, v = (y + (sy + 0.5) / S - x0) / box;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        if (rounded) {
          const r = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
          if (dx * dx + dy * dy > r * r) continue;
        }
        if (inGlyph(u, v, 0.72)) fg++; else bg++;
      }
      const n = S * S, page = n - bg - fg;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round((pageBg[i] * page + BLUE[i] * bg + WHITE[i] * fg) / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit, RGB (alfa yok)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const icon = join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png');
writeFileSync(icon, png(1024, 1024, BLUE, false));
console.log('yazıldı:', icon);

const splash = png(2732, 560, WHITE, true);
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const p = join(assets, 'Splash.imageset', f);
  writeFileSync(p, splash);
  console.log('yazıldı:', p);
}
