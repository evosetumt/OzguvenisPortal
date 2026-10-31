import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { formatSize, openFile, uploadFile } from '../../lib/files';
import { timeAgo } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import { CATEGORY_LABEL, PERIOD_LABEL, STATUS_LABEL, type TrackedItemDetail, type Vehicle } from '../../lib/types-tracking';
import { Modal } from '../Modal';
import { TrackedItemForm } from './TrackedItemForm';
import { DaysLeft, fmtDay, fmtMoney } from './common';

interface Props {
  itemId: number;
  users: UserRef[];
  vehicles: Vehicle[];
  onClose(): void;
  onChanged(): void;
  onOpen(id: number): void;
}

export function TrackedItemDrawer({ itemId, users, vehicles, onClose, onChanged, onOpen }: Props) {
  const { data: it, error, reload } = useApi<TrackedItemDetail>(`/tracking/items/${itemId}`);
  const [editing, setEditing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editing && !renewing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing, renewing]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); await reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'İşlem başarısız'); }
  };

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    void run(async () => {
      for (const file of list) {
        const a = await uploadFile(file);
        await api(`/tracking/items/${itemId}/files`, json('POST', { attachmentId: a.id }));
      }
    });
  };
  const removeFile = (id: number) => window.confirm('Dosya kayıttan kaldırılsın mı?') && run(() => api(`/tracking/items/${itemId}/files/${id}`, json('DELETE')));
  const remove = async () => {
    if (!window.confirm('Kayıt silinsin mi?')) return;
    await run(() => api(`/tracking/items/${itemId}`, json('DELETE')));
    onClose();
  };
  const cancel = () => window.confirm('Kayıt iptal edilsin mi? Hatırlatmalar durur.') && run(() => api(`/tracking/items/${itemId}`, json('PATCH', { status: 'cancelled' })));
  const reactivate = () => run(() => api(`/tracking/items/${itemId}`, json('PATCH', { status: 'active' })));

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer" role="dialog" aria-modal="true" aria-label="Kayıt ayrıntısı">
        <header className="modal-head">
          <small>#{itemId}{it && <> · {CATEGORY_LABEL[it.category]}</>}</small>
          <div>
            {it?.canEdit && <button className="icon-btn" title="Düzenle" onClick={() => setEditing(true)}><Pencil size={16} /></button>}
            {it?.canEdit && <button className="icon-btn" title="Sil" onClick={remove}><Trash2 size={16} /></button>}
            <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {!it && !error && <p className="empty">Yükleniyor…</p>}
        {it && (
          <div className="drawer-body">
            <h2>{it.title}</h2>
            <p><DaysLeft days={it.daysLeft} status={it.status} /> <span className="tag">{STATUS_LABEL[it.status]}</span></p>
            {err && <p className="error" role="alert">{err}</p>}
            <dl className="props">
              <dt>Karşı taraf</dt><dd>{it.counterparty ?? '—'}</dd>
              {it.vehicle && <><dt>Araç</dt><dd>{it.vehicle.plate}{it.vehicle.brandModel ? ` · ${it.vehicle.brandModel}` : ''}</dd></>}
              <dt>Dönem</dt><dd>{fmtDay(it.startDate)} – {fmtDay(it.endDate)}</dd>
              <dt>Yenileme</dt><dd>{PERIOD_LABEL[it.renewalPeriod ?? 'none']}</dd>
              <dt>Tutar</dt><dd>{fmtMoney(it.amount, it.currency)}</dd>
              <dt>Sorumlu</dt><dd>{it.owner.fullName}</dd>
              <dt>Bildirilecek</dt><dd>{it.notifyUsers.length ? it.notifyUsers.map((u) => u.fullName).join(', ') : '—'}</dd>
              <dt>Hatırlatma</dt><dd>{it.reminderDays.split(',').join(', ')} gün kala</dd>
            </dl>
            {it.notes && <><h4>Notlar</h4><p className="pre">{it.notes}</p></>}

            {it.canEdit && (
              <div className="actions">
                {it.status !== 'renewed' && it.status !== 'cancelled' && (
                  <button className="btn primary sm" onClick={() => setRenewing(true)}><RefreshCw size={14} /> Yenile</button>
                )}
                {(it.status === 'active' || it.status === 'expired') && <button className="btn ghost sm" onClick={cancel}>İptal et</button>}
                {it.status === 'cancelled' && <button className="btn ghost sm" onClick={reactivate}>Yeniden etkinleştir</button>}
              </div>
            )}

            <h4>Dosyalar</h4>
            {it.files.length === 0 && <p className="empty">Dosya yok</p>}
            <ul className="file-list">
              {it.files.map((f) => (
                <li key={f.id}>
                  <Paperclip size={14} />
                  <button className="file" title="Aç" onClick={() => openFile(f.id).catch((e) => setErr(e.message))}>{f.fileName}</button>
                  <small className="empty">{formatSize(f.size)}</small>
                  {it.canEdit && <button className="icon-btn sm push" title="Kaldır" onClick={() => removeFile(f.id)}><X size={14} /></button>}
                </li>
              ))}
            </ul>
            {it.canEdit && <label className="file-pick link-btn"><Paperclip size={14} /> Dosya ekle<input type="file" multiple onChange={addFiles} /></label>}

            {it.reminders.length > 0 && (
              <>
                <h4>Gönderilen hatırlatmalar</h4>
                <ul className="timeline">
                  {it.reminders.map((r) => (
                    <li key={r.id}><span>{r.daysBefore} gün kala</span><small>{timeAgo(r.sentAt)}</small></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </aside>
      {editing && it && (
        <TrackedItemForm item={it} users={users} vehicles={vehicles} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void reload(); onChanged(); }} />
      )}
      {renewing && it && (
        <RenewForm item={it} onClose={() => setRenewing(false)}
          onRenewed={(next) => { setRenewing(false); onChanged(); onOpen(next.id); }} />
      )}
    </div>
  );
}

function RenewForm({ item, onClose, onRenewed }: { item: TrackedItemDetail; onClose(): void; onRenewed(next: TrackedItemDetail): void }) {
  const auto = item.renewalPeriod && item.renewalPeriod !== 'none';
  const [endDate, setEndDate] = useState('');
  const [amount, setAmount] = useState(item.amount ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const next = await api<TrackedItemDetail>(`/tracking/items/${item.id}/renew`, json('POST', {
        endDate: endDate || undefined,
        amount: amount === '' ? null : Number(amount),
      }));
      onRenewed(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yenilenemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title="Kaydı yenile" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="sub">Yeni dönem {fmtDay(item.endDate)} tarihinden başlar; mevcut kayıt “Yenilendi” olarak kapanır.</p>
        <div className="row">
          <label>Yeni bitiş{auto && <small> (boş: {PERIOD_LABEL[item.renewalPeriod!].toLocaleLowerCase('tr-TR')} hesaplanır)</small>}
            <input type="date" required={!auto} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label>Yeni tutar ({item.currency})<input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Yenileniyor…' : 'Yenile'}</button>
        </div>
      </form>
    </Modal>
  );
}
