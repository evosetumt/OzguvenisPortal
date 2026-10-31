import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { storeGet, storeSet } from '../lib/storage';
import type { FormEvent, ReactNode } from 'react';
import {
  BarChart3, CalendarDays, CheckSquare, ClipboardCheck, FileText, Home, MessageCircle, MessageSquare, Moon, Receipt,
  Search, Settings, Sun, Timer, Video, Wallet, Workflow, LogOut, Plus, LayoutGrid, X, Banknote, Menu, PanelLeftClose, PanelLeftOpen, Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getPrefs, getTheme, setPrefs, setTheme, subscribe } from '../lib/theme';
import { useApi } from '../lib/data';
import type { Project } from '../lib/types';
import { NotificationsBell } from './NotificationsBell';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { connectRealtime, disconnectRealtime, useSocketEvent } from '../lib/realtime';
import { useUnreadMessages } from './chat/useUnreadMessages';
import { initNativeApp } from '../lib/push';
import { placeLens } from '../lib/effects';
import { BrandLogo } from './BrandLogo';
import { Avatar } from './Avatar';
import { UserMenu } from './UserMenu';
import { ProfileDrawer } from './ProfileDrawer';
import { FilePreview } from './FilePreview';
import { CallProvider } from '../lib/calls';
import { CallLayer } from './chat/CallLayer';
import { PushPrompt } from './PushPrompt';
import type { ThemePref } from '../lib/theme';

// perm: görünürlük için gereken izin (dizi ise herhangi biri); yoksa herkese görünür
const NAV: { to: string; label: string; icon: typeof Home; perm?: string | string[] }[] = [
  { to: '/', label: 'Ana Sayfa', icon: Home },
  { to: '/tasks', label: 'Görevler', icon: CheckSquare, perm: 'task.read' },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: 'calendar.read' },
  { to: '/messages', label: 'Mesajlar', icon: MessageSquare },
  { to: '/team', label: 'Ekip', icon: Users },
  { to: '/meetings', label: 'Toplantılar', icon: Video },
  { to: '/approvals', label: 'Onaylarım', icon: ClipboardCheck },
  { to: '/insights', label: 'Analiz', icon: BarChart3, perm: 'report.read' },
  { to: '/orders', label: 'Sipariş / Teklif', icon: FileText, perm: ['order.read', 'quote.read', 'shipment.read'] },
  { to: '/accounts', label: 'Cari Hesaplar', icon: Wallet, perm: 'account.read' },
  { to: '/expenses', label: 'Masraflar', icon: Receipt, perm: 'expense.create' },
  { to: '/payments', label: 'Ödemeler', icon: Banknote, perm: ['payment.read', 'payment.manage'] },
  { to: '/tracking', label: 'Süre Takibi', icon: Timer, perm: 'tracking.read' },
  { to: '/workflows', label: 'Akış Tasarımcısı', icon: Workflow, perm: 'workflow.design' },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
];

const SIDE_KEY = 'ozg-sidebar';
const MOBILE = '(max-width: 860px)';
const readSide = () => storeGet(SIDE_KEY) !== 'closed';

/** Masaüstünde kenar menü açık/kapalı (tercih saklanır); telefonda soldan açılan çekmece (her açılışta kapalı). */
function useSidebar() {
  const [desktopOpen, setDesktopOpen] = useState(readSide);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const on = () => { setMobile(mq.matches); setMobileOpen(false); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const toggle = () => {
    if (mobile) { setMobileOpen((o) => !o); return; }
    setDesktopOpen((o) => {
      storeSet(SIDE_KEY, o ? 'closed' : 'open');
      return !o;
    });
  };
  return { open: mobile ? mobileOpen : desktopOpen, mobile, desktopOpen, mobileOpen, toggle, closeMobile: () => setMobileOpen(false) };
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, can, logout, reloadSession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [theme, setT] = useState(getTheme()); // o an görünen (otomatikte sistemin teması)
  const [themePref, setThemePref] = useState(getPrefs().theme);
  // Sistem teması değişince (otomatik) veya hesaptan tercih gelince güncellenir.
  useEffect(() => subscribe(() => { setT(getTheme()); setThemePref(getPrefs().theme); }), []);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const side = useSidebar();
  // Gizli menüdeki bağlantılar klavyeyle odaklanmasın (React 18'de inert özelliği tanımlı değil)
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => { asideRef.current?.toggleAttribute('inert', !side.open); }, [side.open]);
  const { data: projects } = useApi<Project[]>(can('task.read') ? '/projects' : null);
  const applyTheme = (n: ThemePref) => setPrefs({ theme: n });
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  // Kişi profili her sayfadan ?profile=<id> ile açılır (Ekip kartları, kullanıcı menüsü)
  const [params, setParams] = useSearchParams();
  const profileId = Number(params.get('profile')) || null;
  const openProfile = (id: number) => { const p = new URLSearchParams(params); p.set('profile', String(id)); setParams(p); };
  const closeProfile = () => { const p = new URLSearchParams(params); p.delete('profile'); setParams(p, { replace: true }); };
  const items = NAV.filter((n) => !n.perm || [n.perm].flat().some(can));
  const pinned = (projects ?? []).filter((p) => p.pinned);
  const openCount = (projects ?? []).reduce((n, p) => n + p.openTasks, 0);
  const unreadMessages = useUnreadMessages(me!.id);

  // Yönetici rolümü/yetkilerimi değiştirdi: menü ve erişim hemen güncellensin.
  useSocketEvent('auth:changed', () => void reloadSession());
  // Oturum açıkken tek WebSocket bağlantısı; çıkışta (Shell kaldırılınca) kapanır.
  useEffect(() => { connectRealtime(); return () => disconnectRealtime(); }, []);
  // Mobil (Capacitor): bildirime dokununca ilgili sayfayı aç, Android geri tuşu
  useEffect(() => { void initNativeApp(nav); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kayan menü göstergesi: aktif öğeye yumuşakça kayar
  const navRef = useRef<HTMLElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const move = () => placeLens(navRef.current, lensRef.current, navRef.current?.querySelector<HTMLElement>('.nav-item.active') ?? null);
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [loc.pathname, loc.search, items.length, pinned.length, side.open]);

  // Telefonda sayfa değişince çekmece kapanır; Esc ile de kapanır.
  useEffect(() => { side.closeMobile(); setSheet(false); }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!side.mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && side.closeMobile();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [side.mobileOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ctrl+B (Mac: ⌘B) menüyü açar/kapatır
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); side.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Genel arama şimdilik görevlerde arar; diğer modüller geldikçe genişletilecek.
  const search = (e: FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/tasks?q=${encodeURIComponent(q.trim())}`); };

  return (
    // Arama yöneticisi oturum boyunca açık: gelen arama her sayfada çalar.
    <CallProvider>
    <div className={'shell' + (side.desktopOpen ? '' : ' side-closed') + (side.mobileOpen ? ' side-open' : '')}>
      {side.mobileOpen && <div className="side-scrim" onClick={side.closeMobile} aria-hidden="true" />}
      <aside className="glass sidebar" id="sidebar" aria-label="Ana menü" ref={asideRef}>
        <div className="brand">
          <BrandLogo emblem />
          <button className="icon-btn side-close" title="Menüyü gizle (Ctrl+B)" aria-controls="sidebar" aria-expanded="true" onClick={side.toggle}>
            {side.mobile ? <X size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
        <nav ref={navRef} className="has-lens">
          <span className="nav-lens" ref={lensRef} aria-hidden="true" />
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => 'nav-item' + (isActive && !(to === '/tasks' && new URLSearchParams(loc.search).has('project')) ? ' active' : '')}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {to === '/tasks' && openCount > 0 && <span className="nav-count">{openCount}</span>}
              {to === '/messages' && unreadMessages > 0 && <span className="nav-count">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
            </NavLink>
          ))}
          {pinned.length > 0 && <small className="nav-section">Sabitlenenler</small>}
          {pinned.map((p) => (
            <NavLink key={p.id} to={`/tasks?project=${p.id}`}
              className={() => 'nav-item' + (loc.pathname === '/tasks' && new URLSearchParams(loc.search).get('project') === String(p.id) ? ' active' : '')}>
              <i className="dot" style={{ background: p.color }} /><span>{p.name}</span>
              {p.openTasks > 0 && <span className="nav-count">{p.openTasks}</span>}
            </NavLink>
          ))}
        </nav>
        <UserMenu theme={themePref} onTheme={applyTheme} onProfile={() => openProfile(me!.id)} />
      </aside>
      <div className="main">
        <header className="glass topbar">
          {(side.mobile || !side.desktopOpen) && (
            <button className="icon-btn side-open-btn" title="Menüyü göster (Ctrl+B)" aria-controls="sidebar" aria-expanded={side.open} onClick={side.toggle}>
              {side.mobile ? <Menu size={21} /> : <PanelLeftOpen size={21} />}
            </button>
          )}
          <form className="search" onSubmit={search} role="search">
            <Search size={19} /><input placeholder="Görevlerde ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          {can('task.write') && <button className="icon-btn" title="Hızlı görev ekle" onClick={() => nav('/tasks?new=1')}><Plus size={21} /></button>}
          <button className="icon-btn theme-btn" title="Tema" onClick={toggle}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
          <NotificationsBell />
        </header>
        <main className="content">{children}</main>
        <PushPrompt />
      </div>
      {/* Telefon: alt sekme çubuğu (ilk 4 bölüm + tüm bölümleri açan Menü) */}
      <nav className="glass tabbar">
        {items.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <Icon size={21} /><span>{label.split(' ')[0]}</span>
            {to === '/messages' && unreadMessages > 0 && <i className="tab-dot" />}
          </NavLink>
        ))}
        <button className={'tab' + (sheet || !items.slice(0, 4).some((n) => n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)) ? ' active' : '')}
          aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
          {sheet ? <X size={21} /> : <LayoutGrid size={21} />}<span>Menü</span>
        </button>
      </nav>
      {sheet && (
        <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="glass sheet" role="dialog" aria-label="Tüm bölümler">
            <div className="sheet-grid">
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setSheet(false)} className={({ isActive }) => 'sheet-item' + (isActive ? ' active' : '')}>
                  <span className="sheet-ico"><Icon size={22} /></span><span>{label}</span>
                  {to === '/messages' && unreadMessages > 0 && <i className="tab-dot" />}
                </NavLink>
              ))}
            </div>
            <div className="sheet-user">
              <button className="sheet-me" onClick={() => { setSheet(false); openProfile(me!.id); }} title="Profilim">
                <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} presence={me!.presence ?? 'online'} />
                <span className="who"><b>{me!.fullName}</b><small>Profilim ve fotoğrafım</small></span>
              </button>
              <button className="icon-btn" title="Tema" onClick={toggle}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
              <button className="icon-btn" title="Çıkış" onClick={logout}><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      )}
      {profileId && <ProfileDrawer key={profileId} userId={profileId} onClose={closeProfile} />}
      <FilePreview />
    </div>
    <CallLayer />
    </CallProvider>
  );
}
