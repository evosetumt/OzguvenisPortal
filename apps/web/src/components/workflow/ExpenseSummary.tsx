import { Receipt } from './Receipt';
import {
  DECISION_DONE, EXPENSE_STATUS_LABEL, STEP_LABEL, money, shortDate, type ExpenseDetail,
} from '../../lib/types-workflow';
import { timeAgo } from '../../lib/format';

/** Masraf özeti + onay zaman çizelgesi (masraf çekmecesi ve onay kutusunda ortak). */
export function ExpenseSummary({ e }: { e: ExpenseDetail }) {
  return (
    <>
      <dl className="kv">
        <dt>Durum</dt><dd><span className={`status ${e.status}`}>{EXPENSE_STATUS_LABEL[e.status]}</span></dd>
        <dt>Personel</dt><dd>{e.user.fullName}</dd>
        <dt>Tutar</dt><dd><b>{money(e.amount, e.currency)}</b>{e.currency !== 'TRY' && <span className="muted"> · {money(e.amountTry)}</span>}</dd>
        <dt>Kategori</dt><dd>{e.category.name}</dd>
        <dt>Tarih</dt><dd>{shortDate(e.expenseDate)}</dd>
        <dt>Açıklama</dt><dd>{e.description}</dd>
      </dl>
      <h4>Fişler</h4>
      {e.receipts.length ? <div className="receipts">{e.receipts.map((f) => <Receipt key={f.id} file={f} />)}</div> : <p className="empty">Fiş eklenmemiş</p>}
      <h4>Onay geçmişi</h4>
      <ul className="timeline">
        {e.submittedAt && <li className="approved"><b>Onaya gönderildi</b> <small>{timeAgo(e.submittedAt)}</small></li>}
        {e.approvals.map((a) => (
          <li key={a.id} className={a.decision}>
            <b>{STEP_LABEL[a.step] ?? a.step}: {DECISION_DONE[a.decision] ?? a.decision}</b>{' '}
            <small>{a.approver?.fullName ? `${a.approver.fullName} · ` : ''}{timeAgo(a.at)}</small>
            {a.comment && <p>{a.comment}</p>}
          </li>
        ))}
        {e.openTasks.map((t) => (
          <li key={t.id} className="pending">
            <b>{t.name} bekleniyor</b> <small>{t.candidateLabel ?? t.assignee?.fullName ?? ''}</small>
          </li>
        ))}
        {!e.submittedAt && !e.approvals.length && <li><span className="muted">Henüz onaya gönderilmedi</span></li>}
      </ul>
    </>
  );
}
