import { api } from './api';
import { json } from './data';
import type { Task, TaskStatus } from './types';

/** Görevin başka kolona taşınmış kopyası (iyimser güncelleme). Tamamlanma zamanı sunucudaki kuralla aynı tutulur. */
export function withStatus(t: Task, s: TaskStatus): Task {
  const completedAt = s.isDone ? (t.status.isDone ? t.completedAt : new Date().toISOString()) : null;
  return { ...t, statusId: s.id, status: { id: s.id, name: s.name, isDone: s.isDone }, completedAt };
}

/** Görevi kolona taşır (index: kolondaki yeni sırası). */
export const moveTask = (id: number, statusId: number, index = 0) =>
  api(`/tasks/${id}/move`, json('POST', { statusId, index }));

/** İşaret kutusunun hedefi: tamamlanmış görev ilk açık kolona, açık görev tamamlandı kolonuna gider. */
export const toggleTarget = (t: Task, statuses: TaskStatus[] | null | undefined) =>
  statuses?.find((s) => s.isDone !== t.status.isDone);

/**
 * Görevi tamamlandı olarak işaretler veya geri alır: listeyi önce günceller, istek başarısız olursa eski listeye döner
 * ve hatayı yeniden fırlatır (çağıran gösterir ya da yok sayar). Durum tanımlı değilse hiçbir şey yapmaz (false).
 */
export async function toggleTaskDone(
  task: Task, statuses: TaskStatus[] | null | undefined, list: Task[], setList: (next: Task[]) => void,
): Promise<boolean> {
  const target = toggleTarget(task, statuses);
  if (!target) return false;
  setList(list.map((x) => (x.id === task.id ? withStatus(x, target) : x)));
  try {
    await moveTask(task.id, target.id);
    return true;
  } catch (err) {
    setList(list);
    throw err;
  }
}
