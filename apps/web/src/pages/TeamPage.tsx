import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListChecks, MessageSquare, Search, UserPlus } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { PRESENCE } from '../lib/people';
import { Avatar } from '../components/Avatar';
import '../styles/team.css';

interface Member {
  id: number; fullName: string; email: string; title: string | null; avatarUrl: string | null; presence: string;
  departmentId: number | null; department: { id: number; name: string; managerId: number | null } | null; isManager: boolean;
  workload: { open: number; overdue: number; dueWeek: number; doneWeek: number } | null;
}
interface TeamData { capacity: number; members: Member[] }

export const deptHue = (id?: number | null) => (id ? `hsl(${(id * 67) % 360} 70% 62%)` : 'var(--text-2)');

/** Ekip: kişi kartları (durum, unvan, birim, iş yükü). İş yükü yalnızca görev görme yetkisi olan kişiler için görünür. */
export function TeamPage() {
  const { me, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data } = useApi<TeamData>('/team');
  const [dept, setDept] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');

  const members = data?.members ?? [];
  const depts = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number }>();
    for (const x of members) if (x.department) {
      const d = m.get(x.department.id) ?? { id: x.department.id, name: x.department.name, n: 0 };
      d.n++; m.set(d.id, d);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [members]);
  const ql = q.trim().toLocaleLowerCase('tr-TR');
  const shown = members
    .filter((x) => dept === 'all' || x.department?.id === dept)
    .filter((x) => !ql || `${x.fullName} ${x.title ?? ''} ${x.department?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(ql))
    .sort((a, b) => (a.id === me!.id ? -1 : b.id === me!.id ? 1 : 0));

  const online = members.filter((x) => x.presence === 'online').length;
  const focus = members.filter((x) => x.presence === 'focus').length;
  const withLoad = members.filter((x) => x.workload);
  const cap = Math.max(1, data?.capacity ?? 8);
  const avgLoad = withLoad.length ? Math.round(withLoad.reduce((s, x) => s + Math.min(1, x.workload!.open / cap), 0) / withLoad.length * 100) : null;
  const open = (id: number) => { const p = new URLSearchParams(params); p.set('profile', String(id)); setParams(p); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ekip</h1>
          <p className="sub">{members.length} kişi · {depts.length} birim</p>
        </div>
      </div>

      <div className="tm-head">
        <div className="stats">
          <div className="glass stat"><small>Çevrimiçi</small><b>{online}<span className="of"> / {members.length}</span></b></div>
          <div className="glass stat"><small>Odakta</small><b>{focus}</b></div>
          {avgLoad !== null && <div className="glass stat"><small>Ortalama yük</small><b>%{avgLoad}</b></div>}
        </div>
        <div className="tm-tools">
          <label className="tk-find tm-find"><Search size={16} /><input placeholder="Kişi ara…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="seg tm-seg" role="tablist" aria-label="Birim">
            <button role="tab" aria-selected={dept === 'all'} className={dept === 'all' ? 'on' : ''} onClick={() => setDept('all')}>Tümü</button>
            {depts.map((d) => (
              <button key={d.id} role="tab" aria-selected={dept === d.id} className={dept === d.id ? 'on' : ''} onClick={() => setDept(d.id)}>{d.name}</button>
            ))}
          </div>
          {can('user.manage') && <Link className="btn primary" to="/settings?tab=users"><UserPlus size={16} /> Kişi ekle</Link>}
        </div>
      </div>

      <div className="tm-grid">
        {shown.map((x) => {
          const st = PRESENCE[x.presence] ?? PRESENCE.away;
          const pctLoad = x.workload ? Math.min(100, Math.round((x.workload.open / cap) * 100)) : 0;
          return (
            <article key={x.id} className="glass tm-card">
              <header>
                <button className="tm-who" onClick={() => open(x.id)}>
                  <Avatar id={x.id} name={x.fullName} src={x.avatarUrl} size="lg" presence={x.presence} />
                  <span>
                    <b>{x.fullName}{x.id === me!.id && <em className="tm-you">Sen</em>}</b>
                    <small>{x.title ?? (x.isManager ? 'Birim yöneticisi' : '—')}</small>
                  </span>
                </button>
                {x.isManager && <span className="tm-mgr">Yönetici</span>}
              </header>
              <div className="tm-row">
                <span className="tm-state"><i className={'dot-' + st.cls} />{st.label}</span>
                {x.department && <span className="pf-chip"><i style={{ background: deptHue(x.department.id) }} />{x.department.name}</span>}
              </div>
              {x.workload ? (
                <div className="tm-load">
                  <div><small>İş yükü</small><b>{x.workload.open}<span> / {cap}</span></b></div>
                  <div className="tm-bar"><i className={x.workload.open > cap ? 'over' : ''} style={{ width: `${pctLoad}%` }} /></div>
                </div>
              ) : (
                <div className="tm-load muted-load"><small>{x.email}</small></div>
              )}
              <footer>
                {x.workload
                  ? <span className="tm-tasks"><ListChecks size={15} /><b>{x.workload.open}</b> açık görev{x.workload.overdue > 0 && <em> · {x.workload.overdue} geciken</em>}</span>
                  : <span />}
                <span className="tm-actions">
                  <button className="btn sm" onClick={() => open(x.id)}>Profil</button>
                  {x.id !== me!.id && <Link className="icon-btn sm tm-msg" title="Mesaj gönder" to={`/messages?to=${x.id}`}><MessageSquare size={15} /></Link>}
                </span>
              </footer>
            </article>
          );
        })}
        {data && shown.length === 0 && <p className="empty">Eşleşen kişi yok</p>}
      </div>
    </>
  );
}
