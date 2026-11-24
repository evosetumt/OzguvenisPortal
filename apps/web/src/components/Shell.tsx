import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { storeGet, storeSet } from '../lib/storage';
import type { FormEvent, ReactNode } from 'react';
import {
  BarChart3, CalendarDays, CheckSquare, ClipboardCheck, FileText, Home, MessageCircle, MessageSquare, Moon, Receipt,
  Megaphone, Newspaper, Search, Settings, Sun, Timer, Video, Wallet, Workflow, LogOut, Plus, LayoutGrid, X, Menu, PanelLeftClose, PanelLeftOpen, Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getPrefs, getTheme, setPrefs, setTheme, subscribe } from '../lib/theme';
import { useApi } from '../lib/data';
import type { TaskSummary } from '../lib/types';
import { NotificationsBell } from './NotificationsBell';
import { useEffect, useRef, useState } from 'react';
import { connectRealtime, disconnectRealtime, useSocketEvent } from '../lib/realtime';
import { useUnreadMessages } from './chat/useUnreadMessages';
import { initNativeApp } from '../lib/push';
import { BrandLogo } from './BrandLogo';
import { Avatar } from './Avatar';
import { UserMenu } from './UserMenu';
import { ProfileDrawer } from './ProfileDrawer';
import { FilePreview } from './FilePreview';
import { CallProvider } from '../lib/calls';
import { CallLayer } from './chat/CallLayer';
import { PushPrompt } from './PushPrompt';
import { AnnouncementTicker } from './AnnouncementTicker';
import { useOverlay } from '../lib/overlay-stack';
import type { ThemePref } from '../lib/theme';

// perm: görünürlük için gereken izin (dizi ise herhangi biri); yoksa herkese görünür
interface NavItem { to: string; label: string; icon: typeof Home; perm?: string | string[] }
const NAV: NavItem[] = [
  { to: '/', label: 'Ana Sayfa', icon: Home },
  { to: '/tasks', label: 'Görevler', icon: CheckSquare, perm: 'task.read' },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: 'calendar.read' },
  { to: '/messages', label: 'Mesajlar', icon: MessageSquare },
  { to: '/feed', label: 'İş Akışları', icon: Newspaper },
  { to: '/announcements', label: 'Duyurular', icon: Megaphone },
  { to: '/team', label: 'Ekip', icon: Users },
  { to: '/meetings', label: 'Toplantılar', icon: Video },
  { to: '/approvals', label: 'Onaylarım', icon: ClipboardCheck },
  { to: '/insights', label: 'Analiz', icon: BarChart3, perm: 'report.read' },
  { to: '/orders', label: 'Sipariş / Teklif', icon: FileText, perm: ['order.read', 'quote.read', 'shipment.read'] },
  { to: '/accounts', label: 'Cari Hesaplar', icon: Wallet, perm: 'account.read' },
  { to: '/expenses', label: 'Masraflar', icon: Receipt, perm: 'expense.create' },
  { to: '/tracking', label: 'Süre Takibi', icon: Timer, perm: 'tracking.read' },
  { to: '/workflows', label: 'Süreç Tasarımcısı', icon: Workflow, perm: 'workflow.design' },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
];

/** Telefon alt çubuğunda gösterilecek bölümler (öncelik sırası). */
const TAB_ORDER = ['/', '/tasks', '/messages', '/calendar', '/feed'];

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
  // Menüdeki görev sayacı: bana atanmış açık görevler
  const { data: myTasks } = useApi<TaskSummary>(can('task.read') ? '/tasks/summary?mine=1' : null);
  const applyTheme = (n: ThemePref) => setPrefs({ theme: n });
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  // Kişi profili her sayfadan ?profile=<id> ile açılır (Ekip kartları, kullanıcı menüsü)
  const [params, setParams] = useSearchParams();
  const profileId = Number(params.get('profile')) || null;
  const openProfile = (id: number) => { const p = new URLSearchParams(params); p.set('profile', String(id)); setParams(p); };
  const closeProfile = () => { const p = new URLSearchParams(params); p.delete('profile'); setParams(p, { replace: true }); };
  const items = NAV.filter((n) => !n.perm || [n.perm].flat().some(can));
  const openCount = myTasks?.open ?? 0;
  const unreadMessages = useUnreadMessages(me!.id);
  const canAdd = can('task.write');
  // Alt çubuk sekmeleri: öncelik sırasıyla yetkili olunanlar; ortada "+" varsa 3, yoksa 4 sekme sığar.
  const tabs = TAB_ORDER.map((to) => items.find((n) => n.to === to)).filter((n): n is NavItem => !!n).slice(0, canAdd ? 3 : 4);
  const isOn = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  const onTab = tabs.some((n) => isOn(n.to));
  const renderTab = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
      <Icon size={22} /><span>{label.split(' ')[0]}</span>
      {to === '/messages' && unreadMessages > 0 && <i className="tab-dot" />}
    </NavLink>
  );

  // Yönetici rolümü/yetkilerimi değiştirdi: menü ve erişim hemen güncellensin.
  useSocketEvent('auth:changed', () => void reloadSession());
  // Oturum açıkken tek WebSocket bağlantısı; çıkışta (Shell kaldırılınca) kapanır.
  useEffect(() => { connectRealtime(); return () => disconnectRealtime(); }, []);
  // Mobil (Capacitor): bildirime dokununca ilgili sayfayı aç, Android geri tuşu
  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    void initNativeApp(nav, () => disposed).then((d) => { dispose = d; if (disposed) d(); });
    return () => { disposed = true; dispose?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Telefonda sayfa değişince çekmece kapanır; Esc ile de kapanır.
  useEffect(() => { side.closeMobile(); setSheet(false); }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useOverlay(side.closeMobile, side.mobileOpen);
  useOverlay(() => setSheet(false), sheet);
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
        <nav>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {to === '/tasks' && openCount > 0 && <span className="nav-count">{openCount}</span>}
              {to === '/messages' && unreadMessages > 0 && <span className="nav-count">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
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
          {/* Görev araması yalnız Görevler sekmesinde; diğer sayfalarda kafa karıştırmasın. */}
          {loc.pathname.startsWith('/tasks') && (
            <form className="search" onSubmit={search} role="search">
              <Search size={19} /><input placeholder="Görevlerde ara…" aria-label="Görevlerde ara" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          )}
          <div className="topbar-end">
            {canAdd && <button className="icon-btn add-btn" title="Hızlı görev ekle" onClick={() => nav('/tasks?new=1')}><Plus size={21} /></button>}
            <button className="icon-btn theme-btn" title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'} onClick={toggle}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
            <NotificationsBell />
          </div>
        </header>
        <main className="content"><AnnouncementTicker />{children}</main>
        <PushPrompt />
      </div>
      {/* Telefon: alt sekme çubuğu — ana bölümler, ortada hızlı görev "+", sağda tüm bölümleri açan Menü */}
      <nav className="glass tabbar" aria-label="Alt menü">
        {tabs.slice(0, 2).map(renderTab)}
        {canAdd && (
          <button className="tab tab-add" onClick={() => nav('/tasks?new=1')} aria-label="Hızlı görev ekle">
            <i><Plus size={24} strokeWidth={2.4} /></i><span>Yeni</span>
          </button>
        )}
        {tabs.slice(2).map(renderTab)}
        <button className={'tab' + (sheet || !onTab ? ' active' : '')} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
          {sheet ? <X size={22} /> : <LayoutGrid size={22} />}<span>Menü</span>
        </button>
      </nav>
      {sheet && (
        <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="glass sheet" role="dialog" aria-label="Tüm bölümler">
            <p className="sheet-title">Tüm bölümler</p>
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
