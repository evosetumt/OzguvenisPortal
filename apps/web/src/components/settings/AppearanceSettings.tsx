import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { PALETTES, getPrefs, setPrefs, subscribe, type ThemePref } from '../../lib/theme';

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Açık', icon: Sun },
  { id: 'dark', label: 'Koyu', icon: Moon },
  { id: 'auto', label: 'Otomatik', icon: Monitor },
];

const MODE_HINT: Record<ThemePref, string> = {
  auto: 'Otomatik: cihazın açık/koyu ayarını izler',
  light: 'Açık',
  dark: 'Koyu',
};

/** Ayarlar → Görünüm: açık/koyu mod ve renk teması. Seçim anında uygulanır ve hesaba kaydedilir. */
export function AppearanceSettings() {
  const [p, setP] = useState(getPrefs());
  useEffect(() => subscribe(() => setP(getPrefs())), []);
  const palette = PALETTES.find((x) => x.id === p.palette);

  return (
    <section className="glass panel appearance">
      <div>
        <h3>Görünüm</h3>
        <small className="muted">Tercihleriniz hesabınızda saklanır; hangi cihazdan girerseniz girin aynı görünür.</small>
      </div>

      <div className="appearance-row">
        <div><h4>Mod</h4><small>{MODE_HINT[p.theme]}</small></div>
        <div className="seg" role="radiogroup" aria-label="Mod">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={p.theme === id} className={p.theme === id ? 'on' : ''} onClick={() => setPrefs({ theme: id })}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4>Renk teması</h4><small>{palette?.label}</small>
        <div className="palettes" role="radiogroup" aria-label="Renk teması">
          {PALETTES.map((x) => {
            const on = p.palette === x.id;
            return (
              <button key={x.id} role="radio" aria-checked={on} className={'pal' + (on ? ' on' : '')} onClick={() => setPrefs({ palette: x.id })}>
                <span className="pal-thumb" data-palette={x.id} aria-hidden="true">
                  <span className="pal-hero" />
                  <span className="pal-row"><i /><b /></span>
                  {on && <span className="pal-check"><Check size={12} /></span>}
                </span>
                {x.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
