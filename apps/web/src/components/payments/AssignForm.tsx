import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import type { UserRef } from '../../lib/types';
import type { Payment } from '../../lib/types-payments';
import { fmtDay, fmtMoney } from '../tracking/common';
import { Modal } from '../Modal';

/** Birim yöneticisi ödemeyi bir kişiye görevlendirir; birim çalışanları listede önce gelir. */
export function AssignForm({ payment, users, onClose, onDone }: { payment: Payment; users: UserRef[]; onClose(): void; onDone(): void }) {
  const [assigneeId, setAssigneeId] = useState(payment.status === 'assigned' && payment.assignee ? String(payment.assignee.id) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const own = users.filter((u) => u.departmentId === payment.departmentId);
  const others = users.filter((u) => u.departmentId !== payment.departmentId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/payments/${payment.id}/assign`, json('POST', { assigneeId: Number(assigneeId) }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görevlendirilemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title="Ödemeyi görevlendir" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="pay-hint"><b>{payment.title}</b> · {fmtMoney(payment.amount, payment.currency)} · vade {fmtDay(payment.dueDate)}</p>
        <label>Görevli
          <select autoFocus required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="" disabled>Kişi seçin</option>
            {own.length > 0 && <optgroup label={payment.department.name}>{own.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</optgroup>}
            <optgroup label={own.length ? 'Diğer birimler' : 'Kişiler'}>{others.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</optgroup>
          </select>
        </label>
        <p className="pay-hint">Seçilen kişiye görev atanır ve bildirim gider. Görev tamamlanınca ödeme “ödendi” olur.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy || !assigneeId}>{busy ? 'Kaydediliyor…' : 'Görevlendir'}</button>
        </div>
      </form>
    </Modal>
  );
}
