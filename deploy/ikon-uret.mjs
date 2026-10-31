// Uygulama ikonlarını (PWA + mobil) bağımlılıksız üretir: mavi zemin üzerinde beyaz "Ö" (halka + iki nokta).
// Kullanım: node deploy/ikon-uret.mjs  → apps/web/public/icons/*.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'icons');
mkdirSync(out, { recursive: true });

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

/** maskable: içerik güvenli alanda (%80) kalır, köşeler dolu. */
function icon(size, maskable) {
  const S = 4; // kenar yumuşatma için alt örnekleme
  const bg = [37, 99, 235], fg = [255, 255, 255];
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const scale = maskable ? 0.72 : 0.9;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let inBg = 0, inFg = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
        // Zemin: maskable tam kare, normal ikon yuvarlatılmış kare
        const r = maskable ? 0 : 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
        if (dx * dx + dy * dy > r * r) continue;
        inBg++;
        // Harf koordinatı (merkez 0,0)
        const px = (u - 0.5) / scale, py = (v - 0.5) / scale;
        const ry = (py - 0.08) / 1.12; // O hafif dikey elips, aşağı kaydırılmış
        const d = Math.hypot(px, ry);
        const ring = d < 0.27 && d > 0.165;
        const dot = Math.hypot(px + 0.11, py + 0.32) < 0.055 || Math.hypot(px - 0.11, py + 0.32) < 0.055;
        if (ring || dot) inFg++;
      }
      const a = inBg / (S * S), f = inBg ? inFg / inBg : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(bg[i] * (1 - f) + fg[i] * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], ['badge-72.png', 72, false], ['favicon-32.png', 32, false],
]) {
  writeFileSync(join(out, name), icon(size, maskable));
  console.log('yazıldı:', name);
}
