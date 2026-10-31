import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { dateKey } from '../../lib/format';
import { RECURRENCE_LABEL, TYPE_LABEL, type Department, type Payment, type PaymentType, type Recurrence } from '../../lib/types-payments';
import { Modal } from '../Modal';

interface Props {
  payment?: Payment; // verilirse düzenleme
  departments: Department[];
  defaultLeadDays: number;
  onClose(): void;
  onSaved(p: Payment): void;
}

const PLACEHOLDER: Record<PaymentType, string> = {
  cheque: 'örn. ABC Ltd. verilen çek', credit_card: 'örn. Şirket kartı ekstresi', loan: 'örn. İşletme kredisi taksiti',
  tax: 'örn. KDV beyannamesi', sgk: 'örn. SGK primi', rent: 'örn. Depo kirası', invoice: 'örn. Elektrik faturası', other: 'Ödeme adı',
};
const DOC_LABEL: Partial<Record<PaymentType, string>> = { cheque: 'Çek no', credit_card: 'Kart son 4 hane', loan: 'Kredi / sözleşme no' };
const fmtLong = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export function PaymentForm({ payment, departments, defaultLeadDays, onClose, onSaved }: Props) {
  const { me } = useAuth();
  const [f, setF] = useState({
    type: (payment?.type ?? 'cheque') as PaymentType,
    title: payment?.title ?? '',
    counterparty: payment?.counterparty ?? '',
    docNo: payment?.docNo ?? '',
    amount: payment?.amount ?? '',
    currency: payment?.currency ?? 'TRY',
    dueDate: payment ? dateKey(payment.dueDate) : '',
    departmentId: String(payment?.departmentId ?? (departments.some((d) => d.id === me!.department?.id) ? me!.department?.id : departments[0]?.id) ?? ''),
    leadDays: payment?.leadDays === null || payment?.leadDays === undefined ? '' : String(payment.leadDays),
    recurrence: (payment?.recurrence ?? 'none') as Recurrence,
    notes: payment?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dept = departments.find((d) => String(d.id) === f.departmentId);
  const lead = f.leadDays === '' ? defaultLeadDays : Number(f.leadDays);
  const taskDay = f.dueDate ? new Date(new Date(f.dueDate + 'T00:00:00Z').getTime() - lead * 86400000) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = {
      type: f.type, title: f.title, counterparty: f.counterparty || null, docNo: f.docNo || null,
      amount: Number(f.amount), currency: f.currency, dueDate: f.dueDate, departmentId: Number(f.departmentId),
      leadDays: f.leadDays === '' ? null : Number(f.leadDays), recurrence: f.recurrence, notes: f.notes || null,
    };
    try {
      onSaved(payment
        ? await api<Payment>(`/payments/${payment.id}`, json('PATCH', body))
        : await api<Payment>('/payments', json('POST', body)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title={payment ? 'Ödemeyi düzenle' : 'Yeni ödeme'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>Tür
            <select value={f.type} onChange={up('type')}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Başlık<input autoFocus required maxLength={200} value={f.title} onChange={up('title')} placeholder={PLACEHOLDER[f.type]} /></label>
        </div>
        <div className="row">
          <label>Banka / firma<input maxLength={200} value={f.counterparty} onChange={up('counterparty')} placeholder="Ödemenin yapılacağı yer" /></label>
          <label>{DOC_LABEL[f.type] ?? 'Belge no'}<input maxLength={60} value={f.docNo} onChange={up('docNo')} /></label>
        </div>
        <div className="row">
          <label>Tutar<input type="number" required min={0} step="0.01" value={f.amount} onChange={up('amount')} /></label>
          <label>Para birimi
            <select value={f.currency} onChange={up('currency')}>
              {['TRY', 'USD', 'EUR'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Vade<input type="date" required value={f.dueDate} onChange={up('dueDate')} /></label>
        </div>
        <div className="row">
          <label>Sorumlu birim
            <select required value={f.departmentId} onChange={up('departmentId')}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label>Kaç gün önce görev açılsın
            <input type="number" min={0} max={90} value={f.leadDays} onChange={up('leadDays')} placeholder={`Varsayılan: ${defaultLeadDays}`} />
          </label>
          <label>Tekrar
            <select value={f.recurrence} onChange={up('recurrence')}>
              {Object.entries(RECURRENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <p className="pay-hint">
          {taskDay ? <>Görev <b>{fmtLong(taskDay)}</b> günü </> : <>Görev vadeden {lead} gün önce </>}
          {dept?.manager
            ? <><b>{dept.manager.fullName}</b> ({dept.name} yöneticisi) ekranına düşer; o da istediği kişiye görevlendirir.</>
            : <>açılır. Bu birimin yöneticisi tanımlı değil; görev ödeme yetkililerine bildirilir.</>}
          {f.recurrence !== 'none' && ' Ödendiğinde bir sonraki vade kendiliğinden planlanır.'}
        </p>
        <label>Notlar<textarea rows={3} maxLength={2000} value={f.notes} onChange={up('notes')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
