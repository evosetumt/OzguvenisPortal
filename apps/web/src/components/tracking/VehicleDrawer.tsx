import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { todayKey } from '../../lib/format';
import type { UserRef } from '../../lib/types';
import { CATEGORY_LABEL, type VehicleDetail } from '../../lib/types-tracking';
import { Modal } from '../Modal';
import { DaysLeft, fmtDay, fmtMoney } from './common';

interface Props {
  vehicleId: number;
  users: UserRef[];
  onClose(): void;
  onChanged(): void;
  onOpenItem(id: number): void;
  onNewItem(vehicleId: number): void;
}

export function VehicleDrawer({ vehicleId, users, onClose, onChanged, onOpenItem, onNewItem }: Props) {
  const { data: v, error, reload } = useApi<VehicleDetail>(`/tracking/vehicles/${vehicleId}`);
  const [editing, setEditing] = useState(false);
  const [addingService, setAddingService] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editing && !addingService && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing, addingService]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); await reload(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'İşlem başarısız'); }
  };
  const remove = async () => {
    if (!window.confirm('Araç silinsin mi?')) return;
    await run(() => api(`/tracking/vehicles/${vehicleId}`, json('DELETE')));
    onClose();
  };
  const removeService = (id: number) => window.confirm('Servis kaydı silinsin mi?') && run(() => api(`/tracking/services/${id}`, json('DELETE')));

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="glass drawer" role="dialog" aria-modal="true" aria-label="Araç ayrıntısı">
        <header className="modal-head">
          <small>Araç</small>
          <div>
            {v?.canEdit && <button className="icon-btn" title="Düzenle" onClick={() => setEditing(true)}><Pencil size={16} /></button>}
            {v?.canEdit && <button className="icon-btn" title="Sil" onClick={remove}><Trash2 size={16} /></button>}
            <button className="icon-btn" title="Kapat" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}
        {!v && !error && <p className="empty">Yükleniyor…</p>}
        {v && (
          <div className="drawer-body">
            <h2>{v.plate}</h2>
            {err && <p className="error" role="alert">{err}</p>}
            <dl className="props">
              <dt>Marka / model</dt><dd>{v.brandModel ?? '—'}{v.year ? ` (${v.year})` : ''}</dd>
              <dt>Zimmetli</dt><dd>{v.assignedUser?.fullName ?? '—'}</dd>
              <dt>Kilometre</dt><dd className="mono">{v.km !== null ? `${v.km.toLocaleString('tr-TR')} km` : '—'}</dd>
            </dl>
            {v.notes && <p className="pre">{v.notes}</p>}

            <h4>Süre takibi kayıtları {v.canEdit && <button className="link-btn push" onClick={() => onNewItem(v.id)}><Plus size={14} /> Ekle</button>}</h4>
            {v.items.length === 0 && <p className="empty">Kayıt yok (kasko, muayene…)</p>}
            <ul className="timeline">
              {v.items.map((i) => (
                <li key={i.id}>
                  <button className="link-btn" onClick={() => onOpenItem(i.id)}>{CATEGORY_LABEL[i.category]} · {i.title}</button>
                  <span><small>{fmtDay(i.endDate)}</small> <DaysLeft days={i.daysLeft} status={i.status} /></span>
                </li>
              ))}
            </ul>

            <h4>Servis geçmişi {v.canEdit && <button className="link-btn push" onClick={() => setAddingService(true)}><Plus size={14} /> Servis ekle</button>}</h4>
            {v.services.length === 0 && <p className="empty">Servis kaydı yok</p>}
            <ul className="timeline">
              {v.services.map((s) => (
                <li key={s.id}>
                  <span>
                    <b>{s.type}</b><br />
                    <small>{fmtDay(s.date)}{s.km !== null ? ` · ${s.km.toLocaleString('tr-TR')} km` : ''}{s.cost ? ` · ${fmtMoney(s.cost)}` : ''}</small>
                    {(s.nextDueDate || s.nextDueKm) && <><br /><small>Sonraki: {s.nextDueDate ? fmtDay(s.nextDueDate) : ''}{s.nextDueKm ? ` / ${s.nextDueKm.toLocaleString('tr-TR')} km` : ''}</small></>}
                    {s.notes && <><br /><small>{s.notes}</small></>}
                  </span>
                  {v.canEdit && <button className="icon-btn sm" title="Sil" onClick={() => removeService(s.id)}><Trash2 size={14} /></button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      {editing && v && (
        <VehicleForm vehicle={v} users={users} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); onChanged(); }} />
      )}
      {addingService && v && (
        <ServiceForm vehicleId={v.id} km={v.km} onClose={() => setAddingService(false)} onSaved={() => { setAddingService(false); void reload(); onChanged(); }} />
      )}
    </div>
  );
}

export function VehicleForm({ vehicle, users, onClose, onSaved }: {
  vehicle?: VehicleDetail; users: UserRef[]; onClose(): void; onSaved(v: VehicleDetail): void;
}) {
  const [f, setF] = useState({
    plate: vehicle?.plate ?? '',
    brandModel: vehicle?.brandModel ?? '',
    year: vehicle?.year ? String(vehicle.year) : '',
    assignedUserId: vehicle?.assignedUserId ? String(vehicle.assignedUserId) : '',
    km: vehicle?.km !== null && vehicle?.km !== undefined ? String(vehicle.km) : '',
    notes: vehicle?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = {
      plate: f.plate,
      brandModel: f.brandModel || null,
      year: f.year ? Number(f.year) : null,
      assignedUserId: f.assignedUserId ? Number(f.assignedUserId) : null,
      km: f.km ? Number(f.km) : null,
      notes: f.notes || null,
    };
    try {
      onSaved(vehicle
        ? await api<VehicleDetail>(`/tracking/vehicles/${vehicle.id}`, json('PATCH', body))
        : await api<VehicleDetail>('/tracking/vehicles', json('POST', body)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title={vehicle ? 'Aracı düzenle' : 'Yeni araç'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>Plaka<input autoFocus required minLength={2} maxLength={20} value={f.plate} onChange={up('plate')} placeholder="34 ABC 123" /></label>
          <label>Marka / model<input maxLength={120} value={f.brandModel} onChange={up('brandModel')} /></label>
        </div>
        <div className="row">
          <label>Model yılı<input type="number" min={1950} max={2100} value={f.year} onChange={up('year')} /></label>
          <label>Kilometre<input type="number" min={0} value={f.km} onChange={up('km')} /></label>
        </div>
        <label>Zimmetli kişi
          <select value={f.assignedUserId} onChange={up('assignedUserId')}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </label>
        <label>Notlar<textarea rows={2} maxLength={1000} value={f.notes} onChange={up('notes')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ServiceForm({ vehicleId, km, onClose, onSaved }: { vehicleId: number; km: number | null; onClose(): void; onSaved(): void }) {
  const [f, setF] = useState({ type: 'Periyodik bakım', date: todayKey(), km: km !== null ? String(km) : '', cost: '', nextDueDate: '', nextDueKm: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/tracking/vehicles/${vehicleId}/services`, json('POST', {
        type: f.type,
        date: f.date,
        km: f.km ? Number(f.km) : null,
        cost: f.cost ? Number(f.cost) : null,
        nextDueDate: f.nextDueDate || null,
        nextDueKm: f.nextDueKm ? Number(f.nextDueKm) : null,
        notes: f.notes || null,
      }));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
      setBusy(false);
    }
  };

  return (
    <Modal title="Servis kaydı" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>İşlem
            <input required maxLength={60} list="service-types" value={f.type} onChange={up('type')} />
            <datalist id="service-types">
              {['Periyodik bakım', 'Lastik değişimi', 'Yağ değişimi', 'Onarım', 'Hasar', 'Egzoz emisyon'].map((t) => <option key={t} value={t} />)}
            </datalist>
          </label>
          <label>Tarih<input type="date" required value={f.date} onChange={up('date')} /></label>
        </div>
        <div className="row">
          <label>Kilometre<input type="number" min={0} value={f.km} onChange={up('km')} /></label>
          <label>Tutar (TL)<input type="number" min={0} step="0.01" value={f.cost} onChange={up('cost')} /></label>
        </div>
        <div className="row">
          <label>Sonraki bakım tarihi<input type="date" value={f.nextDueDate} onChange={up('nextDueDate')} /></label>
          <label>Sonraki bakım km<input type="number" min={0} value={f.nextDueKm} onChange={up('nextDueKm')} /></label>
        </div>
        <label>Not<textarea rows={2} maxLength={1000} value={f.notes} onChange={up('notes')} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
