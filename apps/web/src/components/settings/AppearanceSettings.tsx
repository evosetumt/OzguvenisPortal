import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { ACCENTS, WALLPAPERS, getPrefs, setPrefs, subscribe, type ThemePref } from '../../lib/theme';

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Açık', icon: Sun },
  { id: 'dark', label: 'Koyu', icon: Moon },
  { id: 'auto', label: 'Otomatik', icon: Monitor },
];

/** Ayarlar → Görünüm: tema, duvar kâğıdı, vurgu rengi. Seçim anında uygulanır ve hesaba kaydedilir. */
export function AppearanceSettings() {
  const [p, setP] = useState(getPrefs());
  useEffect(() => subscribe(() => setP(getPrefs())), []);
  const wall = WALLPAPERS.find((w) => w.id === p.wallpaper);
  const accent = ACCENTS.find((a) => a.id === p.accent);

  return (
    <section className="glass panel appearance">
      <div>
        <h3>Görünüm</h3>
        <small className="muted">Tercihleriniz hesabınızda saklanır; hangi cihazdan girerseniz girin aynı görünür.</small>
      </div>

      <div className="appearance-row">
        <div><h4>Tema</h4><small>{p.theme === 'auto' ? 'Otomatik: cihazın açık/koyu ayarını izler' : p.theme === 'light' ? 'Açık' : 'Koyu'}</small></div>
        <div className="seg" role="radiogroup" aria-label="Tema">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={p.theme === id} className={p.theme === id ? 'on' : ''} onClick={() => setPrefs({ theme: id })}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4>Duvar kâğıdı</h4><small>{wall?.label}</small>
        <div className="walls" role="radiogroup" aria-label="Duvar kâğıdı">
          {WALLPAPERS.map((w) => (
            <button key={w.id} role="radio" aria-checked={p.wallpaper === w.id} className={'wall' + (p.wallpaper === w.id ? ' on' : '')}
              onClick={() => setPrefs({ wallpaper: w.id })}>
              <span className="wall-thumb" data-wallpaper={w.id}>{p.wallpaper === w.id && <span className="wall-check"><Check size={12} /></span>}</span>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4>Vurgu rengi</h4><small>{accent?.label}</small>
        <div className="accents" role="radiogroup" aria-label="Vurgu rengi">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={p.accent === a.id} aria-label={a.label} title={a.label}
              className={'accent-dot' + (p.accent === a.id ? ' on' : '')} style={{ background: a.color }} onClick={() => setPrefs({ accent: a.id })}>
              {p.accent === a.id && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
