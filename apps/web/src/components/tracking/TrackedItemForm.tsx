import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { dateKey } from '../../lib/format';
import { uploadFile, type UploadedFile } from '../../lib/files';
import type { UserRef } from '../../lib/types';
import {
  CATEGORY_LABEL, PERIOD_LABEL, type RenewalPeriod, type TrackCategory, type TrackedItemDetail, type Vehicle,
} from '../../lib/types-tracking';
import { Modal } from '../Modal';

interface Props {
  item?: TrackedItemDetail; // verilirse düzenleme
  users: UserRef[];
  vehicles: Vehicle[];
  initialVehicleId?: number;
  onClose(): void;
  onSaved(item: TrackedItemDetail): void;
}

const VEHICLE_CATS: TrackCategory[] = ['insurance', 'vehicle_inspection', 'vehicle_maintenance'];

export function TrackedItemForm({ item, users, vehicles, initialVehicleId, onClose, onSaved }: Props) {
  const { me } = useAuth();
  const [f, setF] = useState({
    category: (item?.category ?? (initialVehicleId ? 'vehicle_inspection' : 'contract')) as TrackCategory,
    title: item?.title ?? '',
    counterparty: item?.counterparty ?? '',
    vehicleId: String(item?.vehicleId ?? initialVehicleId ?? ''),
    startDate: item?.startDate ? dateKey(item.startDate) : '',
    endDate: item ? dateKey(item.endDate) : '',
    amount: item?.amount ?? '',
    currency: item?.currency ?? 'TRY',
    renewalPeriod: (item?.renewalPeriod ?? 'yearly') as RenewalPeriod,
    ownerId: String(item?.ownerId ?? me!.id),
    reminderDays: item?.reminderDays ?? '60,30,7,1',
    notes: item?.notes ?? '',
  });
  const [notify, setNotify] = useState<Set<number>>(new Set(item?.notifyUsers.map((u) => u.id) ?? []));
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (id: number) => setNotify((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    setError('');
    try {
      for (const file of list) {
        const u = await uploadFile(file);
        setFiles((x) => [...x, u]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Dosya yüklenemedi'); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = {
      category: f.category,
      title: f.title,
      counterparty: f.counterparty || null,
      vehicleId: f.vehicleId ? Number(f.vehicleId) : null,
      startDate: f.startDate || null,
      endDate: f.endDate,
      amount: f.amount === '' ? null : Number(f.amount),
      currency: f.currency,
      renewalPeriod: f.renewalPeriod,
      ownerId: Number(f.ownerId),
      reminderDays: f.reminderDays,
      notifyUserIds: [...notify],
      notes: f.notes || null,
    };
    try {
      const saved = item
        ? await api<TrackedItemDetail>(`/tracking/items/${item.id}`, json('PATCH', body))
        : await api<TrackedItemDetail>('/tracking/items', json('POST', { ...body, attachmentIds: files.map((x) => x.id) }));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };

  const showVehicle = VEHICLE_CATS.includes(f.category) || !!f.vehicleId;

  return (
    <Modal title={item ? 'Kaydı düzenle' : 'Yeni süre takibi kaydı'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>Tür
            <select value={f.category} onChange={up('category')}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Başlık<input autoFocus required maxLength={200} value={f.title} onChange={up('title')} placeholder="örn. Depo kira sözleşmesi" /></label>
        </div>
        <div className="row">
          <label>Karşı taraf<input maxLength={200} value={f.counterparty} onChange={up('counterparty')} placeholder="Sigorta şirketi, kiraya veren…" /></label>
          {showVehicle && (
            <label>Araç
              <select value={f.vehicleId} onChange={up('vehicleId')}>
                <option value="">—</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.brandModel ? ` · ${v.brandModel}` : ''}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="row">
          <label>Başlangıç<input type="date" value={f.startDate} onChange={up('startDate')} /></label>
          <label>Bitiş<input type="date" required value={f.endDate} onChange={up('endDate')} /></label>
          <label>Yenileme
            <select value={f.renewalPeriod} onChange={up('renewalPeriod')}>
              {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Tutar<input type="number" min={0} step="0.01" value={f.amount} onChange={up('amount')} /></label>
          <label>Para birimi
            <select value={f.currency} onChange={up('currency')}>
              {['TRY', 'USD', 'EUR'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Sorumlu
            <select value={f.ownerId} onChange={up('ownerId')}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </label>
        </div>
        <label>Kaç gün kala hatırlatılsın<input required pattern="\s*\d{1,3}(\s*,\s*\d{1,3}){0,9}\s*" value={f.reminderDays} onChange={up('reminderDays')} placeholder="60,30,7,1" /></label>
        <div className="field">Ayrıca bildirilecekler
          <div className="chips">
            {users.filter((u) => String(u.id) !== f.ownerId).map((u) => (
              <button type="button" key={u.id} className={'chip' + (notify.has(u.id) ? ' on' : '')} onClick={() => toggle(u.id)}>{u.fullName}</button>
            ))}
          </div>
        </div>
        <label>Notlar<textarea rows={3} maxLength={2000} value={f.notes} onChange={up('notes')} /></label>
        {!item && (
          <div className="field">Dosyalar (poliçe, sözleşme…)
            <ul className="file-list">
              {files.map((x) => (
                <li key={x.id}><Paperclip size={14} />{x.fileName}
                  <button type="button" className="icon-btn sm" title="Kaldır" onClick={() => setFiles(files.filter((y) => y.id !== x.id))}><X size={14} /></button>
                </li>
              ))}
            </ul>
            <label className="file-pick link-btn"><Paperclip size={14} /> Dosya ekle<input type="file" multiple onChange={pick} /></label>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
