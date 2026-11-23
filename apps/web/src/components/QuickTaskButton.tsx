import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ListPlus, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/data';
import type { TaskDetail, TaskStatus, UserRef } from '../lib/types';
import { TaskForm } from './TaskForm';
import { Modal } from './Modal';

/**
 * Ekip / Mesajlar kartlarındaki "+" ve sohbet başlığındaki "Görev" düğmesi: seçilen kişiye atanmış hazır görev formunu açar.
 * labeled: sohbet başlığındaki metinli düğme. members: grup sohbetinde atanan listesi grup üyeleriyle sınırlanır.
 * Görev yazma yetkisi (task.write) olmayanlara gösterilmez.
 */
export function QuickTaskButton({ userId, userName, className = '', labeled = false, members }: {
  userId: number; userName: string; className?: string; labeled?: boolean; members?: UserRef[];
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<TaskDetail | null>(null);
  if (!can('task.write')) return null;

  const start = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setCreated(null); setOpen(true); };
  return (
    <>
      {labeled ? (
        <button type="button" className={'btn sm ' + className} title={`${userName} için görev aç`} onClick={start}><ListPlus size={16} /><span>Görev</span></button>
      ) : (
        <button type="button" className={'icon-btn sm quick-task ' + className} title={`${userName} için görev aç`} aria-label={`${userName} için görev aç`} onClick={start}>
          <Plus size={15} />
        </button>
      )}
      {open && <QuickTaskModal userId={userId} userName={userName} members={members} created={created} onCreated={setCreated} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickTaskModal({ userId, userName, members, created, onCreated, onClose }: {
  userId: number; userName: string; members?: UserRef[]; created: TaskDetail | null; onCreated(t: TaskDetail): void; onClose(): void;
}) {
  const { data: statuses } = useApi<TaskStatus[]>('/task-statuses');
  const { data: users } = useApi<UserRef[]>('/users/directory');

  if (created) {
    return (
      <Modal title="Görev açıldı" onClose={onClose}>
        <div className="form">
          <p className="quick-task-ok"><CheckCircle2 size={18} /> <span><b>{created.title}</b> görevi {created.assignee?.fullName ?? userName} kişisine atandı; bildirim gönderildi.</span></p>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose}>Kapat</button>
            <Link className="btn primary" to={`/tasks?id=${created.id}`} onClick={onClose}>Göreve git</Link>
          </div>
        </div>
      </Modal>
    );
  }
  if (!statuses || !users) return <Modal title="Görev aç" onClose={onClose}><p className="empty">Yükleniyor…</p></Modal>;
  // Kişi dizinde yoksa (ör. pasif) yine de seçili görünsün
  const base = members ?? users;
  const list = base.some((u) => u.id === userId) ? base : [...base, { id: userId, fullName: userName }];
  return <TaskForm statuses={statuses} users={list} initialAssigneeId={userId} onClose={onClose} onCreated={onCreated} />;
}
