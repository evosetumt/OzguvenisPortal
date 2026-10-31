import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { storeGet, storeSet } from '../lib/storage';
import { Avatar } from '../components/Avatar';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Check, ChevronDown, Columns3, Flag, Folder, List, MessageSquare, Plus, Search, User, X } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { dateKey, formatDue, initials, isOverdue, isToday, todayKey } from '../lib/format';
import { PRIORITY_LABEL, TASK_TYPE_LABEL, type Priority, type Project, type Task, type TaskStatus, type TaskSummary, type UserRef } from '../lib/types';
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
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [qDebounced, setQDebounced] = useState('');
  const [createIn, setCreateIn] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropErr, setDropErr] = useState('');
  const [prio, setPrio] = useState<Priority | ''>('');
  const [sort, setSort] = useState<'due' | 'prio'>('due');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [overCol, setOverCol] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setProjectId(params.get('project') ?? ''); }, [params]);
  useEffect(() => { const pq = params.get('q'); if (pq !== null) setQ(pq); }, [params]);

  const query = new URLSearchParams();
  if (projectId) query.set('projectId', projectId);
  if (mine) query.set('mine', '1');
  const assigneeId = params.get('assignee'); // Analiz > İş yükü bağlantısı
  if (assigneeId) query.set('assigneeId', assigneeId);
  if (qDebounced) query.set('q', qDebounced);

  const { data: statuses } = useApi<TaskStatus[]>('/task-statuses');
  const { data: projects, reload: reloadProjects } = useApi<Project[]>('/projects');
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

  const refresh = () => { void reload(); void reloadSummary(); void reloadProjects(); };

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

    const moved = tasks.find((t) => t.id === id)!;
    col.splice(index, 0, { ...moved, statusId: status.id, status: { id: status.id, name: status.name, isDone: status.isDone } });
    const order = new Map(col.map((t, i) => [t.id, i]));
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, statusId: status.id, status: { id: status.id, name: status.name, isDone: status.isDone }, sortOrder: order.get(t.id)! } : order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t)));
    try {
      setDropErr('');
      await api(`/tasks/${id}/move`, json('POST', { statusId: status.id, index }));
      void reloadSummary();
    } catch (err) {
      setTasks(prev);
      setDropErr(err instanceof Error ? err.message : 'Taşınamadı');
    }
  };


  const canWrite = can('task.write');
  const doneStatus = statuses?.find((s) => s.isDone);
  const shown = (list: Task[]) => (prio ? list.filter((t) => t.priority === prio) : list);
  const projectName = projects?.find((p) => String(p.id) === projectId)?.name;
  const openTotal = (tasks ?? []).filter((t) => !t.status.isDone).length;
  const projectCount = new Set((tasks ?? []).filter((t) => !t.status.isDone).map((t) => t.projectId ?? 0)).size;

  /** Listede yuvarlak işaret: görevi tamamlandı kolonuna taşır veya geri alır. */
  const toggleDone = async (t: Task) => {
    if (!statuses || !doneStatus) return;
    const target = t.status.isDone ? statuses.find((s) => !s.isDone)! : doneStatus;
    const prev = tasks;
    setTasks((tasks ?? []).map((x) => (x.id === t.id ? { ...x, statusId: target.id, status: { id: target.id, name: target.name, isDone: target.isDone } } : x)));
    try {
      await api(`/tasks/${t.id}/move`, json('POST', { statusId: target.id, index: 0 }));
      void reloadSummary();
    } catch (err) {
      setTasks(prev);
      setDropErr(err instanceof Error ? err.message : 'Güncellenemedi');
    }
  };

  return (
    <>
      <header className="tk-head">
        <div className="tk-lead">
          <h1>Görevler</h1>
          <p className="tk-sub">{openTotal} açık iş · {projectCount} proje</p>
        </div>
        <dl className="tk-stats">
          <div className="glass stat"><dt>Açık</dt><dd>{summary?.open ?? '–'}</dd></div>
          <div className="glass stat"><dt>Bu hafta bitecek</dt><dd>{summary?.dueThisWeek ?? '–'}</dd></div>
          <div className={'glass stat' + (summary?.overdue ? ' alert' : '')}><dt>Geciken</dt><dd>{summary?.overdue ?? '–'}</dd></div>
          <div className="glass stat"><dt>Bu hafta biten</dt><dd>{summary?.completedThisWeek ?? '–'}</dd></div>
        </dl>
        <div className="tk-actions">
          <div className="seg" role="group" aria-label="Görünüm">
            <button className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => switchView('board')}><Columns3 size={16} /> Pano</button>
            <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => switchView('list')}><List size={16} /> Liste</button>
          </div>
          {canWrite && <button className="btn primary" onClick={() => setCreateIn(statuses?.[0]?.id ?? 0)}><Plus size={18} /> Yeni görev</button>}
        </div>
      </header>

      <div className="glass tk-bar">
        <label className={'tk-chip' + (projectId ? ' on' : '')}>
          {projectId ? <i className="tk-hue" style={{ ['--hue' as string]: projects?.find((p) => String(p.id) === projectId)?.color }} /> : <Folder size={17} />}
          <span className="tk-chip__label">{projectName ?? 'Tüm projeler'}</span><ChevronDown size={15} />
          <select value={projectId} onChange={(e) => setParam('project', e.target.value || null)} aria-label="Proje">
            <option value="">Tüm projeler</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
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
          <input type="search" placeholder="Başlık, proje, cari kodu veya belge no ile süz" value={q} onChange={(e) => setQ(e.target.value)} />
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
        <section className="glass tk-listcard">
          <header className="tk-listcard__head">
            <div><h3>Tüm görevler</h3><p className="tk-listcard__sub">{shown(tasks ?? []).length} görev</p></div>
            <div className="seg sm" role="group" aria-label="Sıralama">
              <button className={sort === 'due' ? 'on' : ''} onClick={() => setSort('due')}>Bitiş</button>
              <button className={sort === 'prio' ? 'on' : ''} onClick={() => setSort('prio')}>Öncelik</button>
            </div>
          </header>
          {columns.map(({ status, tasks: all }, ci) => {
            const rows = sortRows(shown(all), sort);
            const closed = collapsed.has(status.id);
            return (
              <div key={status.id} className="tk-group">
                <button className="tk-group__btn" aria-expanded={!closed}
                  onClick={() => setCollapsed((s) => { const n = new Set(s); closed ? n.delete(status.id) : n.add(status.id); return n; })}>
                  <ChevronDown size={18} className={'tk-chev' + (closed ? ' closed' : '')} />
                  <i className={'tk-dot ' + dotClass(status, ci)} /> {status.name} <span className="tk-count">{rows.length}</span>
                </button>
                {!closed && (
                  <ul className="tk-rows">
                    {rows.length === 0 && <li className="tk-row empty-row">Görev yok</li>}
                    {rows.map((t) => {
                      const overdue = isOverdue(t.dueDate, t.status.isDone);
                      return (
                        <li key={t.id} className={'tk-row' + (t.status.isDone ? ' is-done' : '')}>
                          <input type="checkbox" className="tk-check" checked={t.status.isDone} disabled={!canWrite}
                            aria-label={t.status.isDone ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'} onChange={() => void toggleDone(t)} />
                          <button className="tk-row__title" onClick={() => setParam('id', String(t.id))}>
                            {t.title}{t.taskType !== 'general' && <small> · {TASK_TYPE_LABEL[t.taskType]}</small>}
                          </button>
                          <span className="tk-row__proj">{t.project && <ProjChip p={t.project} />}</span>
                          <span className={'tk-row__due' + (overdue ? ' late' : isToday(t.dueDate) ? ' today' : '')}>{t.dueDate && <><CalendarDays size={15} /> {formatDue(t.dueDate)}</>}</span>
                          <span className="tk-row__prio"><Prio p={t.priority} /></span>
                          <span className="tk-row__who">{t.assignee && <Avatar id={t.assignee.id} name={t.assignee.fullName} size="sm" title={t.assignee.fullName} />}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {showCreate && statuses && (
        <TaskForm projects={projects ?? []} statuses={statuses} users={users ?? []} initialStatusId={createIn || undefined}
          onClose={() => { setCreateIn(null); setParam('new', null); }}
          onCreated={(t) => { setCreateIn(null); refresh(); const p = new URLSearchParams(params); p.delete('new'); p.set('id', String(t.id)); setParams(p, { replace: true }); }} />
      )}
      {openId && statuses && (
        <TaskDrawer key={openId} taskId={openId} projects={projects ?? []} statuses={statuses} users={users ?? []}
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

function ProjChip({ p }: { p: { name: string; color: string } }) {
  return <span className="pchip" style={{ ['--hue' as string]: p.color }}><i /><span>{p.name}</span></span>;
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
      style={{ ['--i' as string]: index, ['--hue' as string]: t.project?.color ?? 'var(--accent-ink)' }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="tk-card__top">
        {t.project ? <ProjChip p={t.project} /> : <span className="tk-card__ref">#{t.id}</span>}
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
