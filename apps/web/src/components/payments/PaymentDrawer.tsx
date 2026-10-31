import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, ExternalLink, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { timeAgo } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import { RECURRENCE_LABEL, STATUS_LABEL, TYPE_LABEL, type Department, type Payment } from '../../lib/types-payments';
import { DaysLeft, fmtDay, fmtMoney } from '../tracking/common';
import { PaymentForm } from './PaymentForm';
import { AssignForm } from './AssignForm';

interface Props {
  paymentId: number;
  users: UserRef[];
  departments: Department[];
  defaultLeadDays: number;
  onClose(): void;
  onChanged(): void;
}

export function PaymentDrawer({ paymentId, users, departments, defaultLeadDays, onClose, onChanged }: Props) {
  const { data: p, error, reload } = useApi<Payment>(`/payments/${paymentId}`);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); await reload(); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'İşlem yapılamadı'); }
  };
  const pay = () => window.confirm('Ödeme yapıldı olarak işaretlensin mi? Görevi de kapanır.') && run(() => api(`/payments/${paymentId}/pay`, json('POST')));
  const cancel = () => window.confirm('Ödeme iptal edilsin mi? Açık görevi kaldırılır.') && run(() => api(`/payments/${paymentId}/cancel`, json('POST')));
  const remove = async () => {
    if (!window.confirm('Ödeme kaydı silinsin mi?')) return;
    try { await api(`/payments/${paymentId}`, { method: 'DELETE' }); onChanged(); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : 'Silinemedi'); }
  };
  const open = p && ['planned', 'awaiting', 'assigned'].includes(p.status);

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer" role="dialog" aria-modal="true" aria-label="Ödeme ayrıntısı">
        <header className="modal-head">
          <small>#{paymentId}{p && <> · {TYPE_LABEL[p.type]}</>}</small>
          <div>
            {p?.canEdit && open && <button className="icon-btn" title="Düzenle" onClick={() => setEditing(true)}><Pencil size={16} /></button>}
            {p?.canEdit && <button className="icon-btn" title="Sil" onClick={() => void remove()}><Trash2 size={16} /></button>}
            <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {!p && !error && <p className="empty">Yükleniyor…</p>}
        {p && (
          <div className="drawer-body">
            <h2>{p.title}</h2>
            <p className="pay-amount">{fmtMoney(p.amount, p.currency)}</p>
            <p>{open && <DaysLeft days={p.daysLeft} />} <span className={'pay-status ' + p.status}>{STATUS_LABEL[p.status]}</span></p>
            {err && <p className="error" role="alert">{err}</p>}

            {p.status === 'awaiting' && p.canAssign && (
              <div className="pay-callout">
                <b>Görevlendirme bekliyor</b>
                <span>Bu ödemenin görevi size düştü. Ödemeyi yapacak kişiyi seçin.</span>
              </div>
            )}

            <dl className="props">
              <dt>Vade</dt><dd>{fmtDay(p.dueDate)}</dd>
              <dt>Banka / firma</dt><dd>{p.counterparty ?? '—'}</dd>
              <dt>Belge no</dt><dd>{p.docNo ?? '—'}</dd>
              <dt>Birim</dt><dd>{p.department.name}{p.department.manager && <small className="muted"> · yönetici {p.department.manager.fullName}</small>}</dd>
              <dt>Görev açılışı</dt><dd>{p.effectiveLeadDays} gün önce ({fmtDay(p.taskDate)}){p.leadDays === null && <small className="muted"> · varsayılan</small>}</dd>
              <dt>Tekrar</dt><dd>{RECURRENCE_LABEL[p.recurrence]}</dd>
              <dt>Görevli</dt><dd>{p.assignee?.fullName ?? '—'}</dd>
              {p.task && <><dt>Görev</dt><dd><Link to={`/tasks?id=${p.task.id}`} className="link-btn">#{p.task.id} · {p.task.status.name} <ExternalLink size={12} /></Link></dd></>}
            </dl>
            {p.notes && <><h4>Notlar</h4><p className="pre">{p.notes}</p></>}

            <div className="actions">
              {p.canAssign && (
                <button className="btn primary sm" onClick={() => setAssigning(true)}>
                  <UserPlus size={14} /> {p.task ? 'Görevi devret' : 'Şimdi görevlendir'}
                </button>
              )}
              {p.canPay && <button className="btn sm" onClick={pay}><CheckCircle2 size={14} /> Ödendi</button>}
              {p.canEdit && open && <button className="btn ghost sm" onClick={cancel}><Ban size={14} /> İptal et</button>}
            </div>

            <h4>Geçmiş</h4>
            <ul className="timeline">
              <li><span>Kaydedildi · {p.createdBy.fullName}</span><small>{timeAgo(p.createdAt)}</small></li>
              {p.taskOpenedAt
                ? <li><span>Görev açıldı{p.department.manager ? ` · ${p.department.manager.fullName}` : ''}</span><small>{timeAgo(p.taskOpenedAt)}</small></li>
                : open && <li><span>Görev açılacak</span><small>{fmtDay(p.taskDate)}</small></li>}
              {p.status !== 'awaiting' && p.assignee && p.taskOpenedAt && <li><span>Görevli: {p.assignee.fullName}</span><small /></li>}
              {p.paidAt && <li><span>Ödendi{p.paidBy ? ` · ${p.paidBy.fullName}` : ''}</span><small>{timeAgo(p.paidAt)}</small></li>}
            </ul>
          </div>
        )}
      </aside>
      {editing && p && (
        <PaymentForm payment={p} departments={departments} defaultLeadDays={defaultLeadDays} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void reload(); onChanged(); }} />
      )}
      {assigning && p && (
        <AssignForm payment={p} users={users} onClose={() => setAssigning(false)}
          onDone={() => { setAssigning(false); void reload(); onChanged(); }} />
      )}
    </div>
  );
}
