// Otomatik üretildi (scratchpad brand.py): Özgüveniş logosunun animasyon katmanları. Elle düzenlemeyin.
import ringGreyGrey from './ringGrey-grey.webp';
import ringGoldGold from './ringGold-gold.webp';
import hookGrey from './hook-grey.webp';
import bar1Gold from './bar1-gold.webp';
import bar2Gold from './bar2-gold.webp';
import l0Gold from './l0-gold.webp';
import l0Grey from './l0-grey.webp';
import l1Gold from './l1-gold.webp';
import l2Gold from './l2-gold.webp';
import l3Gold from './l3-gold.webp';
import l3Grey from './l3-grey.webp';
import l4Gold from './l4-gold.webp';
import l5Gold from './l5-gold.webp';
import l6Gold from './l6-gold.webp';
import l7Gold from './l7-gold.webp';
import l7Grey from './l7-grey.webp';
import l8Gold from './l8-gold.webp';
import lineGrey from './line-grey.webp';

export const LOGO_W = 945;
export const LOGO_H = 283;

export interface LogoPart { src: string; tone: "gold" | "grey"; x: number; y: number; w: number; h: number }
export const LOGO_PIECES: { id: string; parts: LogoPart[] }[] = [
  { id: 'ringGrey', parts: [{ src: ringGreyGrey, tone: 'grey', x: 32, y: 37, w: 169, h: 225 }] },
  { id: 'ringGold', parts: [{ src: ringGoldGold, tone: 'gold', x: 105, y: 22, w: 168, h: 224 }] },
  { id: 'hook', parts: [{ src: hookGrey, tone: 'grey', x: 104, y: 155, w: 97, h: 74 }] },
  { id: 'bar1', parts: [{ src: bar1Gold, tone: 'gold', x: 104, y: 75, w: 97, h: 27 }] },
  { id: 'bar2', parts: [{ src: bar2Gold, tone: 'gold', x: 104, y: 115, w: 97, h: 27 }] },
  { id: 'l0', parts: [{ src: l0Gold, tone: 'gold', x: 293, y: 92, w: 93, h: 93 }, { src: l0Grey, tone: 'grey', x: 323, y: 117, w: 30, h: 28 }] },
  { id: 'l1', parts: [{ src: l1Gold, tone: 'gold', x: 386, y: 94, w: 71, h: 89 }] },
  { id: 'l2', parts: [{ src: l2Gold, tone: 'gold', x: 458, y: 92, w: 84, h: 93 }] },
  { id: 'l3', parts: [{ src: l3Gold, tone: 'gold', x: 553, y: 93, w: 66, h: 92 }, { src: l3Grey, tone: 'grey', x: 575, y: 93, w: 22, h: 28 }] },
  { id: 'l4', parts: [{ src: l4Gold, tone: 'gold', x: 620, y: 92, w: 82, h: 93 }] },
  { id: 'l5', parts: [{ src: l5Gold, tone: 'gold', x: 703, y: 94, w: 55, h: 89 }] },
  { id: 'l6', parts: [{ src: l6Gold, tone: 'gold', x: 764, y: 92, w: 71, h: 93 }] },
  { id: 'l7', parts: [{ src: l7Gold, tone: 'gold', x: 848, y: 116, w: 18, h: 68 }, { src: l7Grey, tone: 'grey', x: 848, y: 92, w: 18, h: 12 }] },
  { id: 'l8', parts: [{ src: l8Gold, tone: 'gold', x: 874, y: 92, w: 59, h: 112 }] },
  { id: 'line', parts: [{ src: lineGrey, tone: 'grey', x: 305, y: 194, w: 578, h: 10 }] },
];
