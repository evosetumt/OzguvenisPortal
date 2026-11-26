import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatTime, localKey, todayKey } from '../lib/format';
import { safeAppPath } from '../lib/safe-path';
import type { CalendarItem, Task, TaskSummary } from '../lib/types';
import { FeedPage } from './FeedPage';
import '../styles/home.css';

const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar'; };
/** Etkinlik zamanı yerel saate göre: bugünse saat, değilse "Yarın 09:00" / "Cum 10:00". */
const eventWhen = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
  return (days === 0 ? '' : days === 1 ? 'Yarın ' : `${d.toLocaleDateString('tr-TR', { weekday: 'short' })} `) + formatTime(iso);
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
  const { data: summary } = useApi<TaskSummary>(canTasks ? '/tasks/summary?mine=1' : null);
  const { data: tasks } = useApi<Task[]>(canTasks ? '/tasks?mine=1' : null);
  const { data: cal } = useApi<CalendarItem[]>(canCal ? `/calendar?from=${start.toISOString()}&to=${end.toISOString()}` : null);

  const today = todayKey();
  const mine = (tasks ?? []).filter((t) => t.assigneeId === me!.id);
  const dueToday = mine.filter((t) => t.dueDate && dateKey(t.dueDate) === today);
  const doneToday = mine.filter((t) => t.status.isDone && t.completedAt && localKey(new Date(t.completedAt)) === today);
  const todayTotal = new Set([...dueToday, ...doneToday].map((t) => t.id)).size;
  const todayDone = new Set([...dueToday.filter((t) => t.status.isDone), ...doneToday].map((t) => t.id)).size;
  const openLeft = mine.filter((t) => !t.status.isDone && t.dueDate && dateKey(t.dueDate) <= today).length;

  const events = (cal ?? []).filter((e) => e.kind === 'event' || e.kind === 'meeting');
  const next = events.filter((e) => new Date(e.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];
  const laterToday = events.filter((e) => !e.allDay && localKey(new Date(e.start)) === today && new Date(e.end).getTime() > Date.now()).length;

  const openEvent = (e: CalendarItem) => nav(safeAppPath(e.link) ?? '/calendar');

  return (
    <>
      {/* Karşılama afişi: paletin degradesi üstünde selam, günün özeti ve hızlı eylemler */}
      <header className="hm-hero">
        <div className="hm-lead">
          <p className="hm-date">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting()}, {me!.fullName.split(' ')[0]}</h1>
          <p className="hm-sub">
            Bugün {laterToday ? `${laterToday} toplantı` : 'toplantı yok'}, {openLeft ? `${openLeft} görev seni bekliyor` : 'bekleyen görev yok'}.
          </p>
        </div>
        <dl className="hm-stats">
          <div className="hm-stat"><dt>Bugün biten</dt><dd>{todayDone}<small>/ {todayTotal}</small></dd></div>
          <div className="hm-stat"><dt>Açık görevim</dt><dd>{summary?.open ?? '–'}</dd></div>
          <div className={'hm-stat' + (summary?.overdue ? ' alert' : '')}><dt>Geciken</dt><dd>{summary?.overdue ?? '–'}</dd></div>
        </dl>
        {next && (
          <div className="hm-actions">
            <button className="btn hm-btn-glass" onClick={() => openEvent(next)}><Video size={17} /> Sıradaki: {eventWhen(next.start)}</button>
          </div>
        )}
      </header>

      {/* İş Akışı ana sayfada: paylaşımlar, görev kartları, arama ve tarih aralığı */}
      <FeedPage embedded />
    </>
  );
}
