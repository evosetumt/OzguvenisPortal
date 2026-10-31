import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ChevronUp, KeyRound, LogOut, Moon, Palette, Settings, SunMoon, Sun, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { json } from '../lib/data';
import { useAuth } from '../lib/auth';
import { PRESENCE, patchPerson } from '../lib/people';
import type { ThemePref } from '../lib/theme';
import { Avatar } from './Avatar';

const STATUSES = ['online', 'focus', 'meeting', 'away'] as const;

/** Sol alttaki kullanıcı kartı: tıklayınca profil, durum, hesap ayarları, tema ve çıkış menüsü yukarı doğru açılır. */
export function UserMenu({ theme, onTheme, onProfile }: { theme: ThemePref; onTheme(t: ThemePref): void; onProfile(): void }) {
  const { me, logout, patchMe } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const presence = me!.presence ?? 'online';
  const setPresence = async (s: string) => {
    patchMe({ presence: s }); patchPerson(me!.id, { presence: s });
    try { await api('/me', json('PATCH', { presence: s })); }
    catch { patchMe({ presence }); patchPerson(me!.id, { presence }); }
  };
  const close = () => setOpen(false);

  return (
    <div className="user-menu" ref={ref}>
      {open && (
        <div className="glass um-pop" role="menu" aria-label="Hesap menüsü">
          <button className="um-head" role="menuitem" onClick={() => { close(); onProfile(); }}>
            <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} size="lg" presence={presence} />
            <span><b>{me!.fullName}</b><small>{me!.email}</small></span>
          </button>
          <div className="um-sep" />
          <small className="um-label">Durum</small>
          {STATUSES.map((s) => (
            <button key={s} role="menuitemradio" aria-checked={presence === s} className="um-item" onClick={() => void setPresence(s)}>
              <i className={'um-dot dot-' + PRESENCE[s].cls} />{PRESENCE[s].label}
              {presence === s && <Check size={15} className="um-end" />}
            </button>
          ))}
          <div className="um-sep" />
          <button className="um-item" role="menuitem" onClick={() => { close(); onProfile(); }}><UserRound size={16} />Profilim ve fotoğrafım</button>
          <Link className="um-item" role="menuitem" to="/settings?tab=account" onClick={close}><KeyRound size={16} />Şifre değiştir</Link>
          <Link className="um-item" role="menuitem" to="/settings?tab=notifications" onClick={close}><Bell size={16} />Bildirim tercihleri</Link>
          <Link className="um-item" role="menuitem" to="/settings" onClick={close}><Settings size={16} />Tüm ayarlar</Link>
          <div className="um-sep" />
          <button className="um-item" role="menuitemradio" aria-checked={theme === 'light'} onClick={() => onTheme('light')}>
            <Sun size={16} />Açık tema{theme === 'light' && <Check size={15} className="um-end" />}
          </button>
          <button className="um-item" role="menuitemradio" aria-checked={theme === 'dark'} onClick={() => onTheme('dark')}>
            <Moon size={16} />Koyu tema{theme === 'dark' && <Check size={15} className="um-end" />}
          </button>
          <button className="um-item" role="menuitemradio" aria-checked={theme === 'auto'} onClick={() => onTheme('auto')}>
            <SunMoon size={16} />Otomatik (sistem){theme === 'auto' && <Check size={15} className="um-end" />}
          </button>
          <Link className="um-item" role="menuitem" to="/settings?tab=appearance" onClick={close}><Palette size={16} />Duvar kâğıdı ve renk</Link>
          <div className="um-sep" />
          <p className="um-hint"><kbd>Ctrl</kbd>+<kbd>B</kbd> menüyü gizler / gösterir</p>
          <button className="um-item danger" role="menuitem" onClick={logout}><LogOut size={16} />Çıkış yap</button>
        </div>
      )}
      <button className={'user um-trigger' + (open ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} presence={presence} />
        <span className="who"><b>{me!.fullName}</b><small>{me!.title ?? me!.department?.name ?? me!.email}</small></span>
        <ChevronUp size={16} className="um-chev" />
      </button>
    </div>
  );
}
