import { Link } from 'react-router-dom';
import { AlertTriangle, CheckSquare, ClipboardCheck, PlusCircle } from 'lucide-react';
import { useApi } from '../../lib/data';
import { toggleTaskDone } from '../../lib/task-status';
import { useAuth } from '../../lib/auth';
import { formatDue, isOverdue, isToday } from '../../lib/format';
import type { Task, TaskStatus, TaskSummary } from '../../lib/types';

const ACTIVE_LIMIT = 6;

/** Sağ panel: Beni bekleyenler (açık / geciken görev, onay) ve Şimdi aktif (bugüne kadar vadesi gelen görevlerim). */
export function FeedSide() {
  const { me, can } = useAuth();
  const canTasks = can('task.read');
  const { data: summary, reload: reloadSummary } = useApi<TaskSummary>(canTasks ? '/tasks/summary?mine=1' : null);
  const { data: tasks, setData: setTasks } = useApi<Task[]>(canTasks ? '/tasks?mine=1' : null);
  const { data: statuses } = useApi<TaskStatus[]>(canTasks ? '/task-statuses' : null);
  const { data: approvals } = useApi<unknown[]>('/process-tasks/mine');

  const active = (tasks ?? [])
    .filter((t) => t.assigneeId === me!.id && !t.status.isDone)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, ACTIVE_LIMIT);

  // Listedeki görevler açık olduğundan işaretlemek tamamlar.
  const complete = async (t: Task) => {
    if (!tasks) return;
    try { if (await toggleTaskDone(t, statuses, tasks, setTasks)) void reloadSummary(); } catch { /* liste geri alındı */ }
  };

  return (
    <aside className="fd-side">
      <section>
        <h4>Beni bekleyenler</h4>
        <ul className="fd-wait">
          {canTasks && <li><CheckSquare size={16} /><Link to="/tasks?mine=1"><b>{summary?.open ?? '–'}</b> görev: Bitirilmeyi bekliyor</Link></li>}
          {canTasks && !!summary?.overdue && <li className="late"><AlertTriangle size={16} /><Link to="/tasks?mine=1"><b>{summary.overdue}</b> görev gecikti</Link></li>}
          <li><ClipboardCheck size={16} /><Link to="/approvals"><b>{approvals?.length ?? 0}</b> onay: Kararınızı bekliyor</Link></li>
        </ul>
      </section>

      {canTasks && (
        <section>
          <h4>Şimdi aktif {can('task.write') && <Link to="/tasks?new=1" className="fd-add" title="Yeni görev"><PlusCircle size={16} /></Link>}</h4>
          {active.length === 0 && <p className="empty">Açık görevin yok.</p>}
          <ul className="fd-active">
            {active.map((t) => (
              <li key={t.id}>
                <input type="checkbox" className="tk-check" disabled={!can('task.write')} onChange={() => void complete(t)} aria-label="Tamamlandı" />
                <Link to={`/tasks?id=${t.id}`}>
                  {t.dueDate && <b className={isOverdue(t.dueDate, false) ? 'late' : isToday(t.dueDate) ? 'today' : ''}>{formatDue(t.dueDate)}:</b>} {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
