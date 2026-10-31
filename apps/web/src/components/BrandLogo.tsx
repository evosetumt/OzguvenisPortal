import type { CSSProperties } from 'react';
import { LOGO_H, LOGO_PIECES, LOGO_W } from '../assets/brand/pieces';
import '../styles/brand.css';

/** Amblemin yazısız kısmı (halkalar, çubuklar, G) ve sırası: animasyonda önce amblem kurulur, sonra harfler. */
const EMBLEM = new Set(['ringGrey', 'ringGold', 'hook', 'bar1', 'bar2']);
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * Şirket logosu. Parçalar ayrı katmanlardır: koyu temada gri kısımlar açılır, animate verilince logo parça parça kurulur.
 * emblem: yalnızca amblem; animate ile birlikte parçalar farklı noktalardan uçup amblemde birleşir.
 */
export function BrandLogo({ animate = false, emblem = false, className = '', label = 'Özgüveniş' }: {
  animate?: boolean; emblem?: boolean; className?: string; label?: string;
}) {
  // Amblem görünümünde kutu amblemin kare alanına (x 22–282, y 12–272) daraltılır.
  const box = emblem ? { x: 22, y: 12, w: 260, h: 260 } : { x: 0, y: 0, w: LOGO_W, h: LOGO_H };
  const pieces = LOGO_PIECES.filter((p) => !emblem || EMBLEM.has(p.id));
  return (
    <span className={`brand-logo${animate ? (emblem ? ' is-assembling' : ' is-building') : ''}${emblem ? ' is-emblem' : ''} ${className}`}
      style={{ aspectRatio: `${box.w} / ${box.h}`, ['--cx' as string]: pct(152 - box.x, box.w), ['--cy' as string]: pct(141.5 - box.y, box.h) }}
      role="img" aria-label={label}>
      {pieces.map((p, i) => (
        <span key={p.id} className={`bl-piece bl-${p.id}${/^l\d$/.test(p.id) ? ' bl-letter' : ''}`} style={{ ['--i' as string]: i - 5 } as CSSProperties}>
          {p.parts.map((q) => (
            <img key={q.src} src={q.src} alt="" draggable={false} className={`bl-${q.tone}`}
              style={{ left: pct(q.x - box.x, box.w), top: pct(q.y - box.y, box.h), width: pct(q.w, box.w), height: pct(q.h, box.h) }} />
          ))}
        </span>
      ))}
    </span>
  );
}
