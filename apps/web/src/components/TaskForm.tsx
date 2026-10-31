import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { json } from '../lib/data';
import { useAuth } from '../lib/auth';
import { PRIORITY_LABEL, TASK_TYPE_LABEL, type Priority, type Project, type TaskDetail, type TaskStatus, type TaskType, type UserRef } from '../lib/types';
import { Modal } from './Modal';
import { CustomerPicker } from './CustomerPicker';

interface Props {
  projects: Project[];
  statuses: TaskStatus[];
  users: UserRef[];
  initialStatusId?: number;
  onClose(): void;
  onCreated(t: TaskDetail): void;
}

export function TaskForm({ projects, statuses, users, initialStatusId, onClose, onCreated }: Props) {
  const { me } = useAuth();
  const [f, setF] = useState({
    title: '',
    description: '',
    projectId: '',
    statusId: String(initialStatusId ?? statuses[0]?.id ?? ''),
    assigneeId: String(me!.id),
    dueDate: '',
    priority: 'normal' as Priority,
    taskType: 'general' as TaskType,
    customerRef: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const t = await api<TaskDetail>('/tasks', json('POST', {
        title: f.title,
        description: f.description || undefined,
        projectId: f.projectId ? Number(f.projectId) : null,
        statusId: Number(f.statusId),
        assigneeId: f.assigneeId ? Number(f.assigneeId) : null,
        dueDate: f.dueDate || null,
        priority: f.priority,
        taskType: f.taskType,
        customerRef: f.taskType !== 'general' && f.customerRef ? f.customerRef : null,
      }));
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title="Yeni görev" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Başlık<input autoFocus required maxLength={250} value={f.title} onChange={up('title')} /></label>
        <label>Açıklama<textarea rows={3} value={f.description} onChange={up('description')} /></label>
        <div className="row">
          <label>Proje
            <select value={f.projectId} onChange={up('projectId')}>
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Durum
            <select value={f.statusId} onChange={up('statusId')}>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Atanan
            <select value={f.assigneeId} onChange={up('assigneeId')}>
              <option value="">Atanmamış</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </label>
          <label>Bitiş tarihi<input type="date" value={f.dueDate} onChange={up('dueDate')} /></label>
        </div>
        <div className="row">
          <label>Öncelik
            <select value={f.priority} onChange={up('priority')}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Tür
            <select value={f.taskType} onChange={up('taskType')}>
              {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        {f.taskType !== 'general' && (
          <label>Netsis cari kodu
            <CustomerPicker value={f.customerRef} onChange={(customerRef) => setF({ ...f, customerRef })} />
            <small>Netsis'te bu cari için {f.taskType === 'erp_order' ? 'sipariş' : 'teklif'} girildiğinde görev otomatik tamamlanır.</small>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Oluştur'}</button>
        </div>
      </form>
    </Modal>
  );
}
