import { useState, type FormEvent } from 'react';
import { Modal } from '../Modal';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { sortedPeople, usePeople } from '../../lib/people';
import { PRIORITY_LABEL } from '../../lib/types';
import type { FeedItem } from '../../lib/types-feed';

interface Props { item: FeedItem; onClose(): void; onCreated(): void }

/** Karttan aktivite (görev) açar; cari kodu karttan gelir. Başkasına atama yalnız görev yazma kapsamı "own" olmayanlara açık. */
export function ActivityModal({ item, onClose, onCreated }: Props) {
  const { me } = useAuth();
  const people = usePeople();
  // Sunucu kuralıyla aynı (tasks.service → assertCanAssign): own yalnız kendine, department birimine, all herkese.
  const writeScope = me!.permissions['task.write'];
  const myDept = me!.department?.id ?? null;
  const canAssignOthers = writeScope === 'all' || (writeScope === 'department' && !!myDept);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [assigneeId, setAssigneeId] = useState(me!.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await api(`/feed/${item.id}/activities`, json('POST', { title: title.trim(), dueDate: dueDate || null, priority, assigneeId }));
      onCreated();
      onClose();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Aktivite eklenemedi'); setBusy(false); }
  };

  const options = sortedPeople(people).filter((p) => writeScope === 'all' || p.id === me!.id || p.departmentId === myDept);

  return (
    <Modal title="Aktivite ekle" onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)}>
        {(item.customerName || item.relatedLabel) && (
          <p className="sub fd-modal-ctx">{[item.customerName, item.relatedLabel].filter(Boolean).join(' · ')}</p>
        )}
        <label>Ne yapılacak?<input autoFocus required maxLength={250} value={title} placeholder="Ör. Müşteriyi ara, numune gönder" onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="row">
          <label>Tarih<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label>Öncelik
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        {canAssignOthers && (
          <label>Sorumlu
            <select value={assigneeId} onChange={(e) => setAssigneeId(Number(e.target.value))}>
              {options.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </label>
        )}
        {err && <p className="error">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={!title.trim() || busy}>Ekle</button>
        </div>
      </form>
    </Modal>
  );
}
