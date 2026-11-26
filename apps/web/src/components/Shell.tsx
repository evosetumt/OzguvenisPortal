import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { storeGet, storeSet } from '../lib/storage';
import type { FormEvent, ReactNode } from 'react';
import {
  BarChart3, CalendarDays, CheckSquare, ClipboardCheck, FileText, Home, MessageSquare, Moon, Receipt,
  Megaphone, Search, Settings, Sun, Timer, Video, Wallet, Workflow, Plus, X, Menu, PanelLeftClose, PanelLeftOpen, Users,
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
  { to: '/', label: 'Ana Sayfa', icon: Home }, // İş Akışı ana sayfada
  { to: '/tasks', label: 'Görevler', icon: CheckSquare, perm: 'task.read' },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: 'calendar.read' },
  { to: '/messages', label: 'Mesajlar', icon: MessageSquare },
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
  const { me, can, reloadSession } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [theme, setT] = useState(getTheme()); // o an görünen (otomatikte sistemin teması)
  const [themePref, setThemePref] = useState(getPrefs().theme);
  // Sistem teması değişince (otomatik) veya hesaptan tercih gelince güncellenir.
  useEffect(() => subscribe(() => { setT(getTheme()); setThemePref(getPrefs().theme); }), []);
  const [q, setQ] = useState('');
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
  // Alt çubuk: yetkili olunan tüm bölümler yatay kayan şeritte; "+" (hızlı görev) sabit kalır.
  const tabStrip = useRef<HTMLDivElement>(null);
  // Açık sekme şeritte görünür olsun (sağda kalan bir bölüme geçilince)
  useEffect(() => {
    tabStrip.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [loc.pathname]);

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
  useEffect(() => { side.closeMobile(); }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useOverlay(side.closeMobile, side.mobileOpen);
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
            <NotificationsBell />
            {/* Sağ üst: açık/koyu mod düğmesi ve kullanıcı (profil, durum, tema ve renk seçimi) */}
            <button className="icon-btn theme-btn" title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'} onClick={toggle}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
            <UserMenu theme={themePref} onTheme={applyTheme} onProfile={() => openProfile(me!.id)} />
          </div>
        </header>
        <main className="content"><AnnouncementTicker />{children}</main>
        <PushPrompt />
      </div>
      {/* Telefon: alt menü — tüm bölümler yatay kayar, sağda sabit hızlı görev "+" */}
      <nav className="glass tabbar" aria-label="Alt menü">
        <div className="tab-strip" ref={tabStrip}>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
              <Icon size={22} /><span>{label.split(' ')[0]}</span>
              {to === '/messages' && unreadMessages > 0 && <i className="tab-dot" />}
            </NavLink>
          ))}
        </div>
        {canAdd && (
          <button className="tab tab-add" onClick={() => nav('/tasks?new=1')} aria-label="Hızlı görev ekle">
            <i><Plus size={24} strokeWidth={2.4} /></i><span>Yeni</span>
          </button>
        )}
      </nav>
      {profileId && <ProfileDrawer key={profileId} userId={profileId} onClose={closeProfile} />}
      <FilePreview />
    </div>
    <CallLayer />
    </CallProvider>
  );
}
