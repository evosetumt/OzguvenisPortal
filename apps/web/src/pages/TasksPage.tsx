import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { storeGet, storeSet } from '../lib/storage';
import { Avatar } from '../components/Avatar';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, ChevronDown, Columns3, Flag, List, MessageSquare, Plus, Search, User, X } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatDue, initials, isOverdue, isToday, todayKey } from '../lib/format';
import { PRIORITY_LABEL, TASK_TYPE_LABEL, type Priority, type Task, type TaskStatus, type TaskSummary, type UserRef } from '../lib/types';
import { moveTask, toggleTaskDone, withStatus } from '../lib/task-status';
import { TaskForm } from '../components/TaskForm';
import { TaskDrawer } from '../components/TaskDrawer';
import '../styles/tasks.css';

type View = 'board' | 'list';
const VIEW_KEY = 'ozg-task-view';
const readView = (): View => (storeGet(VIEW_KEY) === 'list' ? 'list' : 'board');

export function TasksPage() {
  const { me, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(readView);
  const [mine, setMine] = useState(() => params.get('mine') === '1'); // Ana sayfadaki "Geciken görev" bağlantısı ?mine=1 ile gelir
  const [q, setQ] = useState(params.get('q') ?? '');
  const [qDebounced, setQDebounced] = useState('');
  const [createIn, setCreateIn] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropErr, setDropErr] = useState('');
  const [prio, setPrio] = useState<Priority | ''>('');
  const [sort, setSort] = useState<'due' | 'prio'>('due');
  const [listStatus, setListStatus] = useState<number | 'all'>('all'); // liste görünümünde seçili durum sekmesi
  const [overCol, setOverCol] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const pq = params.get('q'); if (pq !== null) setQ(pq); }, [params]);

  const query = new URLSearchParams();
  if (mine) query.set('mine', '1');
  const assigneeId = params.get('assignee'); // Analiz > İş yükü bağlantısı
  if (assigneeId) query.set('assigneeId', assigneeId);
  if (qDebounced) query.set('q', qDebounced);

  const { data: statuses } = useApi<TaskStatus[]>('/task-statuses');
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const { data: tasks, setData: setTasks, error, reload } = useApi<Task[]>(`/tasks?${query}`);
  const { data: summary, reload: reloadSummary } = useApi<TaskSummary>('/tasks/summary');

  const openId = Number(params.get('id')) || null;
  const showCreate = params.get('new') === '1' || createIn !== null;
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };

  const refresh = () => { void reload(); void reloadSummary(); };

  const columns = useMemo(() => (statuses ?? []).map((s) => ({
    status: s,
    tasks: (tasks ?? []).filter((t) => t.statusId === s.id).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  })), [statuses, tasks]);

  const switchView = (v: View) => { setView(v); storeSet(VIEW_KEY, v); };

  // Sürükle-bırak: kartın üst/alt yarısına göre hedef sıra hesaplanır, önce arayüzde güncellenir.
  const onDrop = async (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = dragId;
    setDragId(null);
    if (!id || !tasks) return;
    const col = columns.find((c) => c.status.id === status.id)!.tasks.filter((t) => t.id !== id);
    const cards = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-task]')].filter((el) => Number(el.dataset.task) !== id);
    let index = cards.findIndex((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (index < 0) index = col.length;

    const moved = withStatus(tasks.find((t) => t.id === id)!, status);
    col.splice(index, 0, moved);
    const order = new Map(col.map((t, i) => [t.id, i]));
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...moved, sortOrder: order.get(t.id)! } : order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t)));
    try {
      setDropErr('');
      await moveTask(id, status.id, index);
      void reloadSummary();
    } catch (err) {
      setTasks(prev);
      setDropErr(err instanceof Error ? err.message : 'Taşınamadı');
    }
  };


  const canWrite = can('task.write');
  const shown = (list: Task[]) => (prio ? list.filter((t) => t.priority === prio) : list);
  // Liste görünümü: seçili durum sekmesindeki görevler (Tümü = hepsi), seçilen sıralamayla; her kart kendi durumunu gösterir.
  const statusMeta = new Map(columns.map((c, ci) => [c.status.id, { status: c.status, dot: dotClass(c.status, ci) }]));
  const listed = sortRows(columns.filter((c) => listStatus === 'all' || c.status.id === listStatus).flatMap((c) => shown(c.tasks)), sort);
  const openTotal = (tasks ?? []).filter((t) => !t.status.isDone).length;

  /** Listede yuvarlak işaret: görevi tamamlandı kolonuna taşır veya geri alır. */
  const toggleDone = async (t: Task) => {
    if (!tasks) return;
    try {
      if (await toggleTaskDone(t, statuses, tasks, setTasks)) void reloadSummary();
    } catch (err) {
      setDropErr(err instanceof Error ? err.message : 'Güncellenemedi');
    }
  };

  return (
    <>
      {/* Ana sayfadaki gibi afiş kartı: başlık, dört özet ve eylemler paletin degradesi üstünde (components.css .page-hero) */}
      <header className="page-hero tk-head">
        <div className="hero-lead">
          <p className="hero-kicker">İş takibi</p>
          <h1>Görevler</h1>
          <p className="hero-sub">{openTotal ? `${openTotal} açık iş seni ve ekibini bekliyor.` : 'Açık iş yok.'}</p>
        </div>
        <dl className="hero-stats">
          <div className="hero-stat"><dt>Açık</dt><dd>{summary?.open ?? '–'}</dd></div>
          <div className="hero-stat"><dt>Bu hafta bitecek</dt><dd>{summary?.dueThisWeek ?? '–'}</dd></div>
          <div className={'hero-stat' + (summary?.overdue ? ' alert' : '')}><dt>Geciken</dt><dd>{summary?.overdue ?? '–'}</dd></div>
          <div className="hero-stat"><dt>Bu hafta biten</dt><dd>{summary?.completedThisWeek ?? '–'}</dd></div>
        </dl>
        <div className="hero-actions">
          {canWrite && <button className="btn hero-light" onClick={() => setCreateIn(statuses?.[0]?.id ?? 0)}><Plus size={18} /> Yeni görev</button>}
          <div className="seg" role="group" aria-label="Görünüm">
            <button className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => switchView('board')}><Columns3 size={16} /> Pano</button>
            <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => switchView('list')}><List size={16} /> Liste</button>
          </div>
        </div>
      </header>

      <div className="glass tk-bar">
        <button className={'tk-chip' + (mine ? ' on' : '')} aria-pressed={mine} onClick={() => setMine(!mine)}>
          <Avatar id={me!.id} name={me!.fullName} size="xs" /> Yalnızca benim
        </button>
        <label className={'tk-chip' + (prio ? ' on' : '')}>
          <Flag size={17} /><span className="tk-chip__label">{prio ? PRIORITY_LABEL[prio] : 'Her öncelik'}</span><ChevronDown size={15} />
          <select value={prio} onChange={(e) => setPrio(e.target.value as Priority | '')} aria-label="Öncelik">
            <option value="">Her öncelik</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        {assigneeId && (
          <button className="tk-chip on" title="Kişi filtresini kaldır" onClick={() => { params.delete('assignee'); setParams(params); }}>
            <User size={17} /> {users?.find((x) => String(x.id) === assigneeId)?.fullName ?? 'Kişi'} <X size={15} />
          </button>
        )}
        <label className="tk-find">
          <Search size={17} />
          <input type="search" placeholder="Başlık, cari kodu veya belge no ile süz" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {(error || dropErr) && <p className="error" role="alert">{error || dropErr}</p>}

      {view === 'board' ? (
        <div className="tk-board">
          {columns.map(({ status, tasks: all }, ci) => {
            const col = shown(all);
            return (
              <section key={status.id} className={'glass tk-col' + (overCol === status.id ? ' over' : '')}
                onDragOver={(e) => { if (!canWrite) return; e.preventDefault(); setOverCol(status.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
                onDrop={(e) => { setOverCol(null); void onDrop(e, status); }}>
                <header className="tk-col__head">
                  <i className={'tk-dot ' + dotClass(status, ci)} />
                  <h3 className="tk-col__name">{status.name}</h3>
                  <span className="tk-count">{col.length}</span>
                  {canWrite && <button className="icon-btn sm tk-col__add" title="Bu kolona ekle" onClick={() => setCreateIn(status.id)}><Plus size={17} /></button>}
                </header>
                <div className="tk-col__list">
                  {col.map((t, i) => (
                    <TaskCard key={t.id} t={t} index={i} draggable={canWrite} dragging={dragId === t.id}
                      onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }} onOpen={() => setParam('id', String(t.id))} />
                  ))}
                  {col.length === 0 && <div className="tk-col__empty">{dragId ? 'Buraya bırakın' : 'Görev yok'}</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        // Liste: üstte durum sekmeleri (çip şeridi), altta her görev ayrı kart (Yemeksepeti sipariş listesi gibi)
        <section className="tk-list">
          <div className="tk-list__bar">
            <div className="tk-tabs" role="tablist" aria-label="Durum">
              <button role="tab" aria-selected={listStatus === 'all'} className={'tk-tab' + (listStatus === 'all' ? ' on' : '')} onClick={() => setListStatus('all')}>
                Tümü <b>{shown(tasks ?? []).length}</b>
              </button>
              {columns.map(({ status, tasks: all }, ci) => (
                <button key={status.id} role="tab" aria-selected={listStatus === status.id} className={'tk-tab' + (listStatus === status.id ? ' on' : '')}
                  onClick={() => setListStatus(status.id)}>
                  <i className={'tk-dot ' + dotClass(status, ci)} />{status.name} <b>{shown(all).length}</b>
                </button>
              ))}
            </div>
            <div className="seg sm" role="group" aria-label="Sıralama">
              <button className={sort === 'due' ? 'on' : ''} onClick={() => setSort('due')}>Bitiş</button>
              <button className={sort === 'prio' ? 'on' : ''} onClick={() => setSort('prio')}>Öncelik</button>
            </div>
          </div>
          {listed.length === 0 ? (
            <p className="glass tk-list__empty">Bu durumda görev yok.</p>
          ) : (
            <ul className="tk-cards">
              {listed.map((t) => {
                const meta = statusMeta.get(t.statusId);
                return (
                  <TaskListCard key={t.id} t={t} statusName={meta?.status.name ?? t.status.name} dot={meta?.dot ?? 'todo'} canWrite={canWrite}
                    onToggle={() => void toggleDone(t)} onOpen={() => setParam('id', String(t.id))} />
                );
              })}
            </ul>
          )}
        </section>
      )}

      {showCreate && statuses && (
        <TaskForm statuses={statuses} users={users ?? []} initialStatusId={createIn || undefined}
          onClose={() => { setCreateIn(null); setParam('new', null); }}
          onCreated={() => {
            // Görevi oluşturan kişide detay ekranı açılmaz; görev listede görünür, istenirse oradan açılır.
            setCreateIn(null); refresh(); setParam('new', null);
          }} />
      )}
      {openId && statuses && (
        <TaskDrawer key={openId} taskId={openId} statuses={statuses} users={users ?? []}
          onClose={() => setParam('id', null)} onChanged={refresh} />
      )}
    </>
  );
}

const PRIO_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
function sortRows(list: Task[], sort: 'due' | 'prio') {
  const due = (t: Task) => t.dueDate ?? '9999';
  return [...list].sort((a, b) => sort === 'due'
    ? due(a).localeCompare(due(b)) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
    : PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || due(a).localeCompare(due(b)));
}

/** Kolon noktası: yapılacak (boş halka), devam (mavi), inceleme (mor), tamamlandı (yeşil). */
function dotClass(s: TaskStatus, i: number) {
  if (s.isDone) return 'done';
  return ['todo', 'doing', 'review'][Math.min(i, 2)];
}

interface TaskListCardProps { t: Task; statusName: string; dot: string; canWrite: boolean; onToggle(): void; onOpen(): void }

/**
 * Liste görünümünde tek görev kartı: üstte durum etiketi ve #no, büyük başlık, tarih/öncelik/tür çipleri,
 * altta tamamla kutusu ve atanan kişi. Kartın tamamı görevi açar; tamamla kutusu ayrı çalışır.
 */
function TaskListCard({ t, statusName, dot, canWrite, onToggle, onOpen }: TaskListCardProps) {
  const done = t.status.isDone;
  const overdue = isOverdue(t.dueDate, done);
  const dueClass = overdue ? ' late' : isToday(t.dueDate) ? ' today' : '';
  return (
    <li className={`glass tk-lc prio-${t.priority}` + (done ? ' is-done' : '')}>
      <button className="tk-lc__open" onClick={onOpen} aria-label={`${t.title} görevini aç`} />
      <div className="tk-lc__top">
        <span className="tk-lc__status"><i className={'tk-dot ' + dot} />{statusName}</span>
        <span className="tk-lc__id">#{t.id}</span>
      </div>
      <h4 className="tk-lc__title">{t.title}</h4>
      <div className="tk-lc__chips">
        {t.dueDate && (
          <span className={'tk-lc__chip' + dueClass}>
            <CalendarDays size={14} /> {formatDue(t.dueDate)}{overdue && ' · gecikti'}
          </span>
        )}
        {t.priority !== 'normal' && <Prio p={t.priority} />}
        {t.taskType !== 'general' && <span className="tk-lc__chip">{TASK_TYPE_LABEL[t.taskType]}</span>}
        {!t.dueDate && t.priority === 'normal' && t.taskType === 'general' && <span className="tk-lc__chip muted">Tarih yok</span>}
      </div>
      <div className="tk-lc__foot">
        <label className="tk-lc__done">
          <input type="checkbox" className="tk-check" checked={done} disabled={!canWrite} onChange={onToggle}
            aria-label={done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'} />
          <span>{done ? 'Tamamlandı' : 'Tamamla'}</span>
        </label>
        {t.assignee ? (
          <span className="tk-lc__who" title={t.assignee.fullName}>
            <span>{t.assignee.fullName}</span>
            <Avatar id={t.assignee.id} name={t.assignee.fullName} size="sm" />
          </span>
        ) : <span className="tk-lc__who muted">Atanmamış</span>}
      </div>
    </li>
  );
}

function Prio({ p }: { p: Priority }) {
  return <span className={'prio ' + p}>{(p === 'urgent') && <Flag size={12} strokeWidth={2.4} />}{PRIORITY_LABEL[p]}</span>;
}

function TaskCard({ t, index, draggable, dragging, onDragStart, onDragEnd, onOpen }: {
  t: Task; index: number; draggable: boolean; dragging: boolean; onDragStart(): void; onDragEnd(): void; onOpen(): void;
}) {
  const overdue = isOverdue(t.dueDate, t.status.isDone);
  const pct = t.subtaskTotal ? (t.subtaskDone / t.subtaskTotal) * 100 : 0;
  return (
    <article className={'tk-card prio-' + t.priority + (dragging ? ' lifted' : '') + (t.status.isDone ? ' is-done' : '')} data-task={t.id} draggable={draggable}
      style={{ ['--i' as string]: index, ['--hue' as string]: 'var(--accent-ink)' }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="tk-card__top">
        <span className="tk-card__ref">#{t.id}</span>
        {t.priority !== 'low' && <Prio p={t.priority} />}
      </div>
      <div className="tk-card__title">
        {t.status.isDone && <span className="tk-card__check"><Check size={13} strokeWidth={3} /></span>}
        <span>{t.title}</span>
      </div>
      {t.description && <p className="tk-card__desc">{t.description}</p>}
      {t.taskType !== 'general' && <small className="tk-card__erp">{TASK_TYPE_LABEL[t.taskType]}{t.customerRef ? ` · ${t.customerRef}` : ''}</small>}
      {t.subtaskTotal > 0 && (
        <div className="tk-card__subs"><span className="tk-meter"><i style={{ width: `${pct}%` }} /></span>{t.subtaskDone}/{t.subtaskTotal}</div>
      )}
      <div className="tk-card__foot">
        {t.dueDate && (
          <span className={'tk-pill' + (overdue ? ' late' : isToday(t.dueDate) ? ' today' : '')}>
            {t.status.isDone ? <Check size={13} /> : <CalendarDays size={13} />} {formatDue(t.dueDate)}
          </span>
        )}
        {t.commentCount > 0 && <span className="tk-pill"><MessageSquare size={13} /> {t.commentCount}</span>}
        {t.assignee && (
          <span className="tk-card__who" title={t.assignee.fullName}>
            <span className="tk-card__name">{t.assignee.fullName.split(' ')[0]}</span>
            <Avatar id={t.assignee.id} name={t.assignee.fullName} size="sm" />
          </span>
        )}
      </div>
    </article>
  );
}
