import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, Banknote, CalendarDays, Check, CheckCircle2, ClipboardCheck, MessageSquare, MessageSquareText, Plus, Timer, Video,
} from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatDue, formatTime, initials, isOverdue, localKey, timeAgo, todayKey } from '../lib/format';
import { PRIORITY_LABEL, type CalendarItem, type Task, type TaskStatus, type TaskSummary } from '../lib/types';
import { useUnreadMessages } from '../components/chat/useUnreadMessages';
import '../styles/home.css';

interface HomeData {
  scope: string | null;
  week: { date: string; completed: number }[];
  thisWeek: number;
  lastWeek: number;
  projects: { id: number; name: string; color: string; total: number; done: number; open: number; progress: number; overdue: number; nextDue: string | null; people: string[]; peopleCount: number }[];
  team: { id: number; fullName: string; department: string | null; open: number; overdue: number; dueToday: number }[];
  activity: { kind: 'completed' | 'commented' | 'created'; at: string; who: string | null; taskId: number; title: string; text: string | null }[];
}
interface TrackingSummary { active: number; in30: number; in7: number; expired: number }
interface PaymentSummary { awaiting: number; in7: number; overdue: number }

const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar'; };
/** Etkinlik zamanı yerel saate göre: bugünse saat, değilse "Yarın 09:00" / "Cum 10:00". */
const eventWhen = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
  return (days === 0 ? '' : days === 1 ? 'Yarın ' : `${d.toLocaleDateString('tr-TR', { weekday: 'short' })} `) + formatTime(iso);
};
const minutesUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 60000);
const untilLabel = (iso: string) => {
  const m = minutesUntil(iso);
  if (m <= 0) return 'şimdi';
  if (m < 60) return `${m} dk sonra`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} sa ${m % 60 ? `${m % 60} dk ` : ''}sonra`;
  return new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
};

export function HomePage() {
  const { me, can } = useAuth();
  const nav = useNavigate();
  const canTasks = can('task.read');
  const canCal = can('calendar.read');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []); // "x dk sonra" tazelensin

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const { data: home } = useApi<HomeData>('/reports/home');
  const { data: summary, reload: reloadSummary } = useApi<TaskSummary>(canTasks ? '/tasks/summary?mine=1' : null);
  const { data: tasks, setData: setTasks } = useApi<Task[]>(canTasks ? '/tasks?mine=1' : null);
  const { data: statuses } = useApi<TaskStatus[]>(canTasks ? '/task-statuses' : null);
  const { data: cal } = useApi<CalendarItem[]>(canCal ? `/calendar?from=${start.toISOString()}&to=${end.toISOString()}` : null);
  const { data: approvals } = useApi<unknown[]>('/process-tasks/mine');
  const { data: tracking } = useApi<TrackingSummary>(can('tracking.read') ? '/tracking/summary' : null);
  const { data: payments } = useApi<PaymentSummary>(can('payment.read') || can('payment.manage') ? '/payments/summary' : null);
  const unread = useUnreadMessages(me!.id);

  const today = todayKey();
  const mine = (tasks ?? []).filter((t) => t.assigneeId === me!.id);
  const dueToday = mine.filter((t) => t.dueDate && dateKey(t.dueDate) === today);
  const doneToday = mine.filter((t) => t.status.isDone && t.completedAt && localKey(new Date(t.completedAt)) === today);
  const todayTotal = new Set([...dueToday, ...doneToday].map((t) => t.id)).size;
  const todayDone = new Set([...dueToday.filter((t) => t.status.isDone), ...doneToday].map((t) => t.id)).size;
  const focus = mine
    .filter((t) => !t.status.isDone && t.dueDate && dateKey(t.dueDate) <= today)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const upcomingTasks = mine.filter((t) => !t.status.isDone && (!t.dueDate || dateKey(t.dueDate) > today))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const myList = [...focus, ...doneToday, ...upcomingTasks].slice(0, 7);

  const events = (cal ?? []).filter((e) => e.kind === 'event' || e.kind === 'meeting');
  const todayEvents = events.filter((e) => !e.allDay && localKey(new Date(e.start)) === today);
  const pastToday = todayEvents.filter((e) => new Date(e.end).getTime() < Date.now()).length;
  const nextUp = events.filter((e) => new Date(e.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start));
  const next = nextUp[0];
  const laterToday = todayEvents.filter((e) => new Date(e.end).getTime() > Date.now()).length;
  const openLeft = focus.length;

  const weekDone = summary?.completedThisWeek ?? 0;
  const weekPlan = weekDone + (summary?.dueThisWeek ?? 0);

  const toggle = async (t: Task) => {
    const target = t.status.isDone ? statuses?.find((s) => !s.isDone) : statuses?.find((s) => s.isDone);
    if (!target || !tasks) return;
    const prev = tasks;
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, statusId: target.id, status: { id: target.id, name: target.name, isDone: target.isDone }, completedAt: target.isDone ? new Date().toISOString() : null } : x)));
    try { await api(`/tasks/${t.id}/move`, json('POST', { statusId: target.id, index: 0 })); void reloadSummary(); } catch { setTasks(prev); }
  };

  const openEvent = (e: CalendarItem) => nav(e.link ?? '/calendar');

  return (
    <>
      <header className="hm-head">
        <div className="hm-lead">
          <h1>{greeting()}, {me!.fullName.split(' ')[0]}</h1>
          <p className="hm-sub">
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{laterToday ? `${laterToday} toplantı` : 'toplantı yok'} ve {openLeft ? `${openLeft} görev` : 'bekleyen görev yok'} bugün
          </p>
        </div>
        <dl className="hm-stats">
          <div className="glass stat"><dt>Bugün biten</dt><dd>{todayDone}<small>/ {todayTotal}</small></dd></div>
          <div className="glass stat"><dt>Açık görevim</dt><dd>{summary?.open ?? '–'}</dd></div>
          <div className={'glass stat' + (summary?.overdue ? ' alert' : '')}><dt>Geciken</dt><dd>{summary?.overdue ?? '–'}</dd></div>
        </dl>
        <div className="hm-actions">
          {can('task.write') && <button className="btn ghost" onClick={() => nav('/tasks?new=1')}><Plus size={17} /> Yeni görev</button>}
          {next && <button className="btn primary" onClick={() => openEvent(next)}><Video size={17} /> Sıradaki: {eventWhen(next.start)}</button>}
        </div>
      </header>

      <div className="home">
        <section className="glass hm-card hm-today">
          <header className="hm-card__head"><div><h3>Bugün</h3><p className="hm-card__sub">Halkaları kapat</p></div></header>
          <div className="rings-wrap">
            <Rings rings={[
              { value: todayDone, max: todayTotal, color: 'var(--ring-tasks)' },
              { value: weekDone, max: weekPlan, color: 'var(--ring-focus)' },
              { value: pastToday, max: todayEvents.length, color: 'var(--ring-meet)' },
            ]} />
            <ul className="ring-legend">
              <li style={{ ['--c' as string]: 'var(--ring-tasks)' }}><small>Bugünkü görevler</small><b>{todayDone}<span>/ {todayTotal}</span></b></li>
              <li style={{ ['--c' as string]: 'var(--ring-focus)' }}><small>Bu hafta</small><b>{weekDone}<span>/ {weekPlan}</span></b></li>
              <li style={{ ['--c' as string]: 'var(--ring-meet)' }}><small>Toplantılar</small><b>{pastToday}<span>/ {todayEvents.length}</span></b></li>
            </ul>
          </div>
        </section>

        <section className="glass hm-card hm-next">
          <header className="hm-card__head"><div><h3>Sıradaki</h3></div><Link to="/calendar" className="link-btn">Takvim</Link></header>
          {next ? (
            <button className="next-hero" onClick={() => openEvent(next)}>
              <small>{untilLabel(next.start)}</small>
              <b>{next.title}</b>
              <span>{formatTime(next.start)} – {formatTime(next.end)}{next.location ? ` · ${next.location}` : next.kind === 'meeting' ? ' · Görüntülü toplantı' : ''}</span>
              <span className="next-foot">
                <span className="av-stack">
                  {(next.attendees ?? []).slice(0, 4).map((a) => <Avatar key={a.id} id={a.id} name={a.fullName} size="sm" title={a.fullName} />)}
                </span>
                {next.kind === 'meeting' && <span className="btn primary sm"><Video size={15} /> Katıl</span>}
              </span>
            </button>
          ) : <p className="empty">Önümüzdeki 7 günde toplantı veya etkinlik yok.</p>}
          <ul className="next-list">
            {nextUp.slice(1, 4).map((e) => (
              <li key={e.key}>
                <button onClick={() => openEvent(e)} style={{ ['--c' as string]: e.color ?? (e.kind === 'meeting' ? 'var(--ring-meet)' : 'var(--purple)') }}>
                  <span>{e.title}</span>
                  <small>{eventWhen(e.start)}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass hm-card hm-attn">
          <header className="hm-card__head"><div><h3>Dikkat</h3><p className="hm-card__sub">Senden bir şey bekleyenler</p></div></header>
          <ul className="attn">
            <Attn to="/approvals" icon={ClipboardCheck} hue="var(--purple)" label="Onay bekleyen" value={approvals?.length ?? 0} empty="Bekleyen onay yok" />
            <Attn to="/tasks?mine=1" icon={AlertTriangle} hue="var(--danger)" label="Geciken görev" value={summary?.overdue ?? 0} empty="Geciken görev yok" />
            <Attn to="/messages" icon={MessageSquareText} hue="var(--blue)" label="Okunmamış mesaj" value={unread} empty="Tüm mesajlar okundu" />
            {payments && <Attn to="/payments?view=awaiting" icon={Banknote} hue="var(--orange)" label="Görevlendirme bekleyen ödeme" value={payments.awaiting} empty="Görevlendirilecek ödeme yok" />}
            {payments && <Attn to="/payments" icon={Banknote} hue="var(--danger)" label="7 gün içinde ödeme" value={payments.in7 + payments.overdue} empty="Yaklaşan ödeme yok" />}
            {tracking && <Attn to="/tracking" icon={Timer} hue="var(--orange)" label="30 gün içinde biten sözleşme / poliçe" value={tracking.in30} empty="Yakında biten kayıt yok" />}
          </ul>
        </section>

        {canTasks && (
          <section className="glass hm-card hm-tasks">
            <header className="hm-card__head"><div><h3>Görevlerim</h3><p className="hm-card__sub">Bugün bitecek ve gecikenler</p></div><Link to="/tasks" className="link-btn">Tüm görevler</Link></header>
            {myList.length === 0 && <p className="empty">Size atanmış açık görev yok. 🎉</p>}
            <ul className="hm-rows">
              {myList.map((t) => {
                const late = isOverdue(t.dueDate, t.status.isDone);
                return (
                  <li key={t.id} className={t.status.isDone ? 'is-done' : ''}>
                    <input type="checkbox" className="tk-check" checked={t.status.isDone} disabled={!can('task.write')} onChange={() => void toggle(t)}
                      aria-label={t.status.isDone ? 'Geri al' : 'Tamamlandı'} />
                    <Link to={`/tasks?id=${t.id}`} className="hm-row__main">
                      <b>{t.title}</b>
                      <span>
                        {t.project && <span className="pchip" style={{ ['--hue' as string]: t.project.color }}><i /><span>{t.project.name}</span></span>}
                        {t.dueDate && <small className={late ? 'late' : dateKey(t.dueDate) === today ? 'today' : ''}>{formatDue(t.dueDate)}</small>}
                      </span>
                    </Link>
                    {(t.priority === 'high' || t.priority === 'urgent') && !t.status.isDone && <span className={'prio ' + t.priority}>{PRIORITY_LABEL[t.priority]}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {canTasks && home && (
          <section className="glass hm-card hm-week">
            <header className="hm-card__head">
              <div><h3>Bu hafta</h3><p className="hm-card__sub">{home.scope === 'own' ? 'Bitirdiğin işler' : 'Ekibin bitirdiği işler'}</p></div>
              {can('report.read') && <Link to="/insights" className="icon-btn sm" title="Analiz"><ArrowUpRight size={17} /></Link>}
            </header>
            <p className="ins-sum"><b>{home.thisWeek}</b> tamamlandı <WeekDelta cur={home.thisWeek} prev={home.lastWeek} /></p>
            <WeekBars week={home.week} />
          </section>
        )}

        {canTasks && home && home.projects.length > 0 && (
          <section className="glass hm-card hm-projects">
            <header className="hm-card__head"><div><h3>Projeler</h3></div><Link to="/tasks" className="link-btn">Tümü</Link></header>
            <ul className="proj-rows">
              {home.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/tasks?project=${p.id}`} style={{ ['--hue' as string]: p.color }}>
                    <span className="proj-ico">{p.name.slice(0, 1)}</span>
                    <span className="proj-name"><b>{p.name}</b><small>{p.open} açık{p.overdue ? ` · ${p.overdue} geciken` : ''}{p.nextDue ? ` · sıradaki ${formatDue(p.nextDue)}` : ''}</small></span>
                    <span className="proj-bar"><i style={{ width: `${p.progress}%` }} /></span>
                    <b className="proj-pct">%{p.progress}</b>
                    <span className="av-stack">
                      {p.people.slice(0, 3).map((n) => <i key={n} className="avatar sm" title={n}>{initials(n)}</i>)}
                      {p.peopleCount > 3 && <i className="avatar sm more">+{p.peopleCount - 3}</i>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canTasks && home && <RightNow home={home} />}
      </div>
    </>
  );
}

function Attn({ to, icon: Icon, hue, label, value, empty }: { to: string; icon: typeof Check; hue: string; label: string; value: number; empty: string }) {
  return (
    <li>
      <Link to={to} className={value ? '' : 'quiet'} style={{ ['--hue' as string]: hue }}>
        <span className="attn-ico"><Icon size={18} /></span>
        <span className="attn-text">{value ? label : empty}</span>
        {value > 0 && <b>{value}</b>}
      </Link>
    </li>
  );
}

/** İç içe ilerleme halkaları (dıştan içe). */
function Rings({ rings }: { rings: { value: number; max: number; color: string }[] }) {
  const size = 150, stroke = 15, gap = 4;
  return (
    <svg className="rings" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Bugünkü ilerleme halkaları">
      {rings.map((r, i) => {
        const rad = size / 2 - stroke / 2 - i * (stroke + gap);
        const c = 2 * Math.PI * rad;
        const pct = r.max ? Math.min(1, r.value / r.max) : 0;
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeOpacity={0.2} strokeWidth={stroke} />
            {pct > 0 && (
              <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${pct * c} ${c}`} className="ring-arc" style={{ ['--len' as string]: c }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function WeekDelta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <span className="delta">geçen hafta {prev}</span>;
  const v = Math.round(((cur - prev) / prev) * 100);
  return <span className={'delta ' + (v >= 0 ? 'up' : 'down')}>{v >= 0 ? '+' : '−'}%{Math.abs(v)} geçen haftaya göre</span>;
}

function WeekBars({ week }: { week: HomeData['week'] }) {
  const max = Math.max(1, ...week.map((d) => d.completed));
  const today = todayKey();
  return (
    <div className="wk">
      {week.map((d) => (
        <div key={d.date} className={'wk-col' + (d.date === today ? ' today' : '') + (d.date > today ? ' future' : '')}>
          <div className="wk-track"><i className="wk-bar" style={{ height: `${(d.completed / max) * 100}%` }}><span>{d.completed || ''}</span></i></div>
          <small>{new Date(`${d.date}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'short' })}</small>
        </div>
      ))}
    </div>
  );
}

function RightNow({ home }: { home: HomeData }) {
  const [tab, setTab] = useState<'team' | 'activity'>(home.scope === 'own' ? 'activity' : 'team');
  const showTeam = home.scope !== 'own';
  const ICON = { completed: CheckCircle2, commented: MessageSquare, created: CalendarDays };
  const VERB = { completed: 'tamamladı', commented: 'yorum yaptı', created: 'oluşturdu' };
  return (
    <section className="glass hm-card hm-now">
      <header className="hm-card__head">
        <div><h3>Şu an</h3></div>
        {showTeam && (
          <div className="seg sm" role="group">
            <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Ekip</button>
            <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Hareketler</button>
          </div>
        )}
      </header>
      {tab === 'team' && showTeam ? (
        <ul className="now-list">
          {home.team.length === 0 && <li className="empty">Atanmış açık iş yok.</li>}
          {home.team.map((m) => (
            <li key={m.id}>
              <Link to={`/tasks?assignee=${m.id}`}>
                <span className="avatar-wrap"><Avatar id={m.id} name={m.fullName} /><i className={'presence' + (m.overdue ? ' busy' : m.dueToday ? ' warn' : ' ok')} /></span>
                <span className="now-text"><b>{m.fullName}</b>
                  <small>{m.open} açık iş{m.dueToday ? ` · ${m.dueToday} bugün` : ''}{m.overdue ? ` · ${m.overdue} geciken` : ''}{m.department ? ` · ${m.department}` : ''}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="now-list">
          {home.activity.length === 0 && <li className="empty">Henüz hareket yok.</li>}
          {home.activity.map((a, i) => {
            const Icon = ICON[a.kind];
            return (
              <li key={i}>
                <Link to={`/tasks?id=${a.taskId}`}>
                  <span className={'act-ico ' + a.kind}><Icon size={16} /></span>
                  <span className="now-text"><b>{a.who ?? 'Biri'} <span>{VERB[a.kind]}</span></b><small>{a.title}{a.text ? ` — ${a.text}` : ''}</small></span>
                  <small className="now-time">{timeAgo(a.at)}</small>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
