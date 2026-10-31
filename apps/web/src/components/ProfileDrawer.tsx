import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Camera, ChevronRight, KeyRound, ListChecks, Mail, Phone, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatDue, formatTime, todayKey } from '../lib/format';
import { PRESENCE, patchPerson } from '../lib/people';
import { PRIORITY_LABEL } from '../lib/types';
import { Avatar } from './Avatar';
import '../styles/team.css';

export interface Profile {
  id: number; fullName: string; email: string; phone: string | null; title: string | null; avatarUrl: string | null;
  presence: string; presenceAt: string | null; lastLoginAt: string | null;
  department: { id: number; name: string; managerId: number | null } | null;
  self: boolean; isManager: boolean; capacity: number;
  workload: { open: number; doneWeek: number; overdue: number; dueWeek: number; load: number } | null;
  openTasks: { id: number; title: string; dueDate: string | null; priority: string; project: { id: number; name: string; color: string } | null }[] | null;
  events: { id: number; title: string; startsAt: string; endsAt: string; allDay: boolean }[];
  projects: { id: number; name: string; color: string; role: string; open: number }[];
}

const STATUS_ORDER = ['online', 'focus', 'meeting', 'away'] as const;

/** Görseli ortadan kare kırpar, 320 piksele küçültür ve WebP'ye çevirir (sunucuya en fazla birkaç on KB gider). */
async function toAvatar(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Lütfen bir görsel seçin');
  if (file.size > 15 * 1024 * 1024) throw new Error('Görsel 15 MB’tan küçük olmalı');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
  bmp.close();
  const webp = c.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.88); // WebP desteklemeyen tarayıcı
}

/** Kişi profili (sağdan açılan panel). Kendi profilinde fotoğraf, telefon ve durum değiştirilir. */
export function ProfileDrawer({ userId, onClose }: { userId: number; onClose(): void }) {
  const { me, patchMe } = useAuth();
  const { data: p, setData, error } = useApi<Profile>(`/team/${userId}`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (change: Partial<Profile>) => {
    setData((x) => (x ? { ...x, ...change } : x));
    patchPerson(userId, change as never);
    if (p?.self) patchMe(change as never);
  };

  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const r = await api<{ avatarUrl: string }>('/me/avatar', json('POST', { dataUrl: await toAvatar(file) }));
      update({ avatarUrl: r.avatarUrl });
    } catch (x) { setErr(x instanceof Error ? x.message : 'Fotoğraf yüklenemedi'); }
    finally { setBusy(false); }
  };
  const removePhoto = async () => {
    if (!window.confirm('Profil fotoğrafı kaldırılsın mı?')) return;
    try { await api('/me/avatar', { method: 'DELETE' }); update({ avatarUrl: null }); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Kaldırılamadı'); }
  };
  const setPresence = async (presence: string) => {
    const before = p?.presence;
    update({ presence });
    try { await api('/me', json('PATCH', { presence })); }
    catch (x) { update({ presence: before }); setErr(x instanceof Error ? x.message : 'Durum değiştirilemedi'); }
  };

  const today = todayKey();
  const load = p?.workload ? Math.min(100, p.workload.load) : 0;
  const R = 30, C = 2 * Math.PI * R;
  const deptHue = p?.department ? `hsl(${(p.department.id * 67) % 360} 70% 62%)` : 'var(--text-2)';

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer pf" role="dialog" aria-modal="true" aria-label="Kişi profili">
        <button className="icon-btn pf-close" title="Kapat" onClick={onClose}><X size={18} /></button>
        {error && <p className="error">{error}</p>}
        {!p && !error && <p className="empty">Yükleniyor…</p>}
        {p && (
          <>
            <header className="pf-hero" style={{ ['--hue' as string]: deptHue }}>
              <div className="pf-photo">
                <Avatar id={p.id} name={p.fullName} src={p.avatarUrl} size="xl" presence={p.presence} />
                {p.self && (
                  <>
                    <button className="pf-photo-btn" title="Fotoğraf değiştir" disabled={busy} onClick={() => fileRef.current?.click()}>
                      <Camera size={16} />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
                  </>
                )}
              </div>
              <div className="pf-id">
                <h2>{p.fullName}</h2>
                <p>{p.title ?? (p.isManager ? 'Birim yöneticisi' : '—')}</p>
                <div className="pf-chips">
                  {p.department && <span className="pf-chip"><i style={{ background: deptHue }} />{p.department.name}</span>}
                  <span className="pf-state"><i className={'dot-' + (PRESENCE[p.presence]?.cls ?? 'off')} />{PRESENCE[p.presence]?.label ?? 'Uzakta'}</span>
                </div>
                {p.self && (
                  <div className="pf-photo-actions">
                    <button className="link-btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Yükleniyor…' : p.avatarUrl ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}</button>
                    {p.avatarUrl && <button className="link-btn danger" onClick={() => void removePhoto()}><Trash2 size={13} /> Kaldır</button>}
                  </div>
                )}
              </div>
            </header>
            {err && <p className="error" role="alert">{err}</p>}

            {p.self && (
              <section className="pf-sec">
                <h4>Durumun</h4>
                <div className="pf-seg" role="radiogroup" aria-label="Durum">
                  {STATUS_ORDER.map((s) => (
                    <button key={s} role="radio" aria-checked={p.presence === s} className={p.presence === s ? 'on' : ''} onClick={() => void setPresence(s)}>
                      <i className={'dot-' + PRESENCE[s].cls} />{PRESENCE[s].label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="pf-cards">
              <div className="pf-card">
                <small>E-posta</small>
                <a href={`mailto:${p.email}`}><Mail size={15} /><span>{p.email}</span></a>
              </div>
              <div className="pf-card">
                <small>Telefon</small>
                {/* E-posta ve telefonu kullanıcı değiştiremez; yönetici Ayarlar → Kullanıcılar'dan düzenler. */}
                <span className="pf-val">
                  {p.phone ? <a href={`tel:${p.phone.replace(/\s/g, '')}`}><Phone size={15} /><span>{p.phone}</span></a> : <span className="muted"><Phone size={15} /> —</span>}
                </span>
              </div>
            </div>

            {p.workload && (
              <div className="pf-load">
                <svg viewBox="0 0 76 76" className="pf-ring" aria-hidden="true">
                  <circle cx="38" cy="38" r={R} className="track" />
                  <circle cx="38" cy="38" r={R} className={'bar' + (p.workload.load > 100 ? ' over' : '')}
                    strokeDasharray={`${(load / 100) * C} ${C}`} transform="rotate(-90 38 38)" />
                </svg>
                <div className="pf-ring-label"><b>{p.workload.load}%</b><small>yük</small></div>
                <dl>
                  <dt>Açık görev</dt><dd><b>{p.workload.open}</b> / {p.capacity}</dd>
                  <dt>Bu hafta biten</dt><dd><b>{p.workload.doneWeek}</b></dd>
                  <dt>Bu hafta bitecek</dt><dd><b>{p.workload.dueWeek}</b></dd>
                  <dt>Geciken</dt><dd><b className={p.workload.overdue ? 'danger' : ''}>{p.workload.overdue}</b></dd>
                </dl>
              </div>
            )}

            {p.openTasks && (
              <section className="pf-sec">
                <h4>Açık görevler <span className="pf-count">{p.workload?.open ?? 0}</span></h4>
                {p.openTasks.length === 0 && <p className="empty">Açık görev yok</p>}
                <ul className="pf-list">
                  {p.openTasks.map((t) => {
                    const late = !!t.dueDate && dateKey(t.dueDate) < today;
                    return (
                      <li key={t.id}>
                        <Link to={`/tasks?id=${t.id}`} onClick={onClose}>
                          <span className="pf-ico" style={{ ['--hue' as string]: t.project?.color ?? 'var(--accent)' }}><ListChecks size={15} /></span>
                          <span className="pf-main"><b>{t.title}</b><small className={late ? 'late' : ''}>{t.dueDate ? formatDue(t.dueDate) : 'Tarih yok'}{t.project ? ` · ${t.project.name}` : ''}</small></span>
                          {(t.priority === 'high' || t.priority === 'urgent') && <span className={'prio ' + t.priority}>{PRIORITY_LABEL[t.priority]}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {(p.workload?.open ?? 0) > p.openTasks.length && (
                  <Link className="link-btn" to={p.self ? '/tasks?mine=1' : `/tasks?assignee=${p.id}`} onClick={onClose}>
                    {(p.workload?.open ?? 0) - p.openTasks.length} görev daha
                  </Link>
                )}
              </section>
            )}

            <section className="pf-sec">
              <h4>Bu hafta <span className="pf-count">{p.events.length}</span></h4>
              {p.events.length === 0 && <p className="empty">Bu hafta görünen etkinlik yok</p>}
              <ul className="pf-list">
                {p.events.map((e) => {
                  const d = new Date(e.startsAt);
                  return (
                    <li key={e.id}>
                      <Link to="/calendar" onClick={onClose}>
                        <span className="pf-date"><small>{d.toLocaleDateString('tr-TR', { weekday: 'short' })}</small><b>{d.getDate()}</b></span>
                        <span className="pf-main"><b>{e.title}</b><small>{e.allDay ? 'Tüm gün' : `${formatDue(e.startsAt)} · ${formatTime(e.startsAt)}`}</small></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {p.projects.length > 0 && (
              <section className="pf-sec">
                <h4>Projeler <span className="pf-count">{p.projects.length}</span></h4>
                <ul className="pf-list">
                  {p.projects.map((x) => (
                    <li key={x.id}>
                      <Link to={`/tasks?project=${x.id}`} onClick={onClose}>
                        <span className="pf-pill" style={{ ['--hue' as string]: x.color }} />
                        <span className="pf-main"><b>{x.name}</b><small>{x.role} · {x.open} açık görev</small></span>
                        <ChevronRight size={16} className="muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {p.self && (
              <section className="pf-sec">
                <h4>Hesap</h4>
                <ul className="pf-list">
                  <li><Link to="/settings?tab=account" onClick={onClose}><span className="pf-ico" style={{ ['--hue' as string]: '#f59e0b' }}><KeyRound size={15} /></span><span className="pf-main"><b>Şifre değiştir</b><small>Giriş şifreni güncelle</small></span><ChevronRight size={16} className="muted" /></Link></li>
                  <li><Link to="/settings?tab=notifications" onClick={onClose}><span className="pf-ico" style={{ ['--hue' as string]: '#a78bfa' }}><Bell size={15} /></span><span className="pf-main"><b>Bildirim tercihleri</b><small>Hangi kanaldan haber alacağın</small></span><ChevronRight size={16} className="muted" /></Link></li>
                </ul>
                {me && <p className="pf-foot">Ad, unvan ve birim bilgilerini yöneticin Ayarlar → Kullanıcılar’dan değiştirir.</p>}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
