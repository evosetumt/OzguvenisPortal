import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, Banknote, MessageCircle, Palette, ShieldCheck, Bell, BellRing, Building2, KeyRound, Plus, Receipt, RefreshCw, Users } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { Modal } from '../components/Modal';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { ErpSettings } from '../components/settings/ErpSettings';
import { ExpenseSettings } from '../components/settings/ExpenseSettings';
import { PaymentSettings } from '../components/settings/PaymentSettings';
import { ChatArchive } from '../components/settings/ChatArchive';
import { RolesSettings } from '../components/settings/RolesSettings';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { MailSettings } from '../components/settings/MailSettings';
import { WhatsappSettings } from '../components/settings/WhatsappSettings';

interface Role { id: number; name: string }
interface Department { id: number; name: string; parentId: number | null; manager: { id: number; fullName: string } | null }
interface AdminUser {
  id: number; email: string; fullName: string; phone: string | null; title: string | null; status: string; lastLoginAt: string | null; erpRepCode: string | null;
  department: { id: number; name: string } | null; roles: Role[];
}

/** Ayarlar sekmeleri: kullanıcı yalnızca yetkisi olanları görür; seçili sekme adreste (?tab=) tutulur. */
export function SettingsPage() {
  const { me, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: 'account', label: 'Hesap', icon: KeyRound, show: true },
    { id: 'appearance', label: 'Görünüm', icon: Palette, show: true },
    { id: 'notifications', label: 'Bildirimlerim', icon: Bell, show: true },
    { id: 'rules', label: 'Bildirim kuralları', icon: BellRing, show: can('notification.manage') },
    { id: 'users', label: 'Kullanıcılar', icon: Users, show: can('user.manage') },
    { id: 'roles', label: 'Roller ve yetkiler', icon: ShieldCheck, show: can('user.manage') },
    { id: 'departments', label: 'Departmanlar', icon: Building2, show: can('user.manage') },
    { id: 'expense', label: 'Masraf', icon: Receipt, show: can('expense.accounting') || can('user.manage') },
    { id: 'payment', label: 'Ödeme', icon: Banknote, show: me!.permissions['payment.manage'] === 'all' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, show: can('whatsapp.send') },
    { id: 'erp', label: 'Netsis', icon: RefreshCw, show: can('erp.manage') },
    { id: 'chat-archive', label: 'Sohbet arşivi', icon: Archive, show: can('chat.audit') },
  ].filter((t) => t.show);
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'account';
  // Telefonda sekmeler yatay kayar: seçili sekmeyi görünür alana getir
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tabsRef.current, el = bar?.querySelector<HTMLElement>('[aria-selected=true]');
    if (bar && el) bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [tab]);
  const select = (id: string) => { const p = new URLSearchParams(params); p.set('tab', id); setParams(p, { replace: true }); };

  return (
    <>
      <h1>Ayarlar</h1>
      <p className="sub">Hesap, bildirim ve yönetim ayarları</p>
      <div className="settings-tabs" ref={tabsRef} role="tablist" aria-label="Ayar bölümleri">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="settings-panel"
            className={tab === id ? 'on' : ''} onClick={() => select(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="settings-panel" key={tab}>
        {tab === 'account' && <PasswordForm />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'notifications' && <NotificationSettings part="mine" />}
        {tab === 'rules' && <><NotificationSettings part="rules" /><MailSettings /></>}
        {tab === 'users' && <UsersAdmin part="users" />}
        {tab === 'roles' && <RolesSettings />}
        {tab === 'departments' && <UsersAdmin part="departments" />}
        {tab === 'expense' && <ExpenseSettings />}
        {tab === 'payment' && <PaymentSettings />}
        {tab === 'whatsapp' && <WhatsappSettings />}
        {tab === 'erp' && <ErpSettings />}
        {tab === 'chat-archive' && <ChatArchive />}
      </div>
    </>
  );
}

function PasswordForm() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.newPassword !== f.repeat) { setMsg({ ok: false, text: 'Yeni şifreler eşleşmiyor' }); return; }
    try {
      await api('/auth/password', json('POST', { currentPassword: f.currentPassword, newPassword: f.newPassword }));
      setF({ currentPassword: '', newPassword: '', repeat: '' });
      setMsg({ ok: true, text: 'Şifre değiştirildi' });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Değiştirilemedi' }); }
  };

  return (
    <section className="glass panel narrow">
      <h3>Şifre değiştir</h3>
      <form className="form" onSubmit={submit}>
        <label>Mevcut şifre<input type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></label>
        <div className="row">
          <label>Yeni şifre<input type="password" autoComplete="new-password" minLength={8} required value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></label>
          <label>Tekrar<input type="password" autoComplete="new-password" minLength={8} required value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></label>
        </div>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        <div className="actions"><button className="btn primary">Kaydet</button></div>
      </form>
    </section>
  );
}

function UsersAdmin({ part }: { part: 'users' | 'departments' }) {
  const { data: users, error, reload } = useApi<AdminUser[]>('/users');
  const { data: roles } = useApi<Role[]>('/roles');
  const { data: depts, reload: reloadDepts } = useApi<Department[]>('/departments');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [deptName, setDeptName] = useState('');

  const addDept = async (e: FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) return;
    await api('/departments', json('POST', { name: deptName }));
    setDeptName('');
    void reloadDepts();
  };
  const setManager = async (d: Department, managerId: string) => {
    await api(`/departments/${d.id}`, json('PATCH', { managerId: managerId ? Number(managerId) : null }));
    void reloadDepts();
  };

  return (
    <>
      {part === 'users' && <section className="glass panel">
        <h3>Kullanıcılar <button className="btn primary sm push" onClick={() => setEditing('new')}><Plus size={14} /> Kullanıcı</button></h3>
        {error && <p className="error">{error}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ad</th><th>E-posta</th><th>Departman</th><th>Plasiyer</th><th>Roller</th><th>Durum</th><th>Son giriş</th></tr></thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} onClick={() => setEditing(u)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(u)}>
                  <td><b>{u.fullName}</b></td>
                  <td>{u.email}</td>
                  <td>{u.department?.name ?? '—'}</td>
                  <td>{u.erpRepCode ?? '—'}</td>
                  <td>{u.roles.map((r) => r.name).join(', ') || '—'}</td>
                  <td>{u.status === 'active' ? 'Aktif' : <span className="danger">Pasif</span>}</td>
                  <td>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>}

      {part === 'departments' && <section className="glass panel narrow">
        <h3>Departmanlar</h3>
        <ul className="rows">
          {depts?.map((d) => (
            <li key={d.id} className="row-line">
              <span>{d.name}</span>
              <select value={d.manager?.id ?? ''} onChange={(e) => setManager(d, e.target.value)} aria-label={`${d.name} yöneticisi`}>
                <option value="">Yönetici yok</option>
                {users?.filter((u) => u.status === 'active').map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={addDept}>
          <input placeholder="Yeni departman adı" maxLength={120} value={deptName} onChange={(e) => setDeptName(e.target.value)} />
          <button className="btn primary sm" disabled={!deptName.trim()}>Ekle</button>
        </form>
      </section>}

      {editing && (
        <UserForm user={editing === 'new' ? undefined : editing} roles={roles ?? []} depts={depts ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />
      )}
    </>
  );
}

function UserForm({ user, roles, depts, onClose, onSaved }: {
  user?: AdminUser; roles: Role[]; depts: Department[]; onClose(): void; onSaved(): void;
}) {
  const [f, setF] = useState({
    email: user?.email ?? '',
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    title: user?.title ?? '',
    erpRepCode: user?.erpRepCode ?? '',
    password: '',
    departmentId: String(user?.department?.id ?? ''),
    status: user?.status ?? 'active',
    roleIds: new Set(user?.roles.map((r) => r.id) ?? []),
  });
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const base = {
      fullName: f.fullName,
      phone: f.phone || (user ? null : undefined),
      title: f.title.trim() || null,
      departmentId: f.departmentId ? Number(f.departmentId) : null,
      erpRepCode: f.erpRepCode.trim() || null,
      roleIds: [...f.roleIds],
    };
    try {
      if (user) await api(`/users/${user.id}`, json('PATCH', { ...base, status: f.status, password: f.password || undefined }));
      else await api('/users', json('POST', { ...base, email: f.email, password: f.password }));
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Kaydedilemedi'); }
  };

  const toggleRole = (id: number) => {
    const n = new Set(f.roleIds);
    n.has(id) ? n.delete(id) : n.add(id);
    setF({ ...f, roleIds: n });
  };

  return (
    <Modal title={user ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>Ad soyad<input required minLength={2} maxLength={150} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
          <label>Unvan<input maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ör. Satış Müdürü" /></label>
        </div>
        <div className="row">
          <label>E-posta<input type="email" required disabled={!!user} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Telefon<input maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        </div>
        <div className="row">
          <label>{user ? 'Yeni şifre (boş: değişmez)' : 'Şifre'}
            <input type="password" autoComplete="new-password" minLength={8} required={!user} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </label>
          <label>Departman
            <select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
              <option value="">—</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>
        <label>Netsis plasiyer kodu
          <input maxLength={20} value={f.erpRepCode} onChange={(e) => setF({ ...f, erpRepCode: e.target.value })} placeholder="Sipariş/cari kapsamı için (ör. P01)" />
        </label>
        {user && (
          <label>Durum
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="active">Aktif</option>
              <option value="disabled">Pasif</option>
            </select>
          </label>
        )}
        <div className="field">
          <span>Roller</span>
          <div className="chips">
            {roles.map((r) => (
              <button type="button" key={r.id} className={'chip' + (f.roleIds.has(r.id) ? ' on' : '')} onClick={() => toggleRole(r.id)}>{r.name}</button>
            ))}
          </div>
        </div>
        <small>Rol ve departman değişiklikleri kullanıcının bir sonraki girişinde geçerli olur.</small>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary">Kaydet</button>
        </div>
      </form>
    </Modal>
  );
}
