import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Car, ListChecks, Paperclip, Plus } from 'lucide-react';
import { useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import type { UserRef } from '../lib/types';
import {
  CATEGORY_LABEL, STATUS_LABEL, type TrackCategory, type TrackedItem, type TrackingSummary, type TrackStatus, type Vehicle,
} from '../lib/types-tracking';
import { TrackedItemForm } from '../components/tracking/TrackedItemForm';
import { TrackedItemDrawer } from '../components/tracking/TrackedItemDrawer';
import { VehicleDrawer, VehicleForm } from '../components/tracking/VehicleDrawer';
import { DaysLeft, fmtDay, fmtMoney } from '../components/tracking/common';
import '../styles/tracking.css';

type Tab = 'items' | 'vehicles';

export function TrackingPage() {
  const { can } = useAuth();
  const canWrite = can('tracking.write');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'vehicles' ? 'vehicles' : 'items';
  const openId = Number(params.get('id')) || null;
  const vehicleId = Number(params.get('vehicle')) || null;

  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [creating, setCreating] = useState<{ vehicleId?: number } | null>(null);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (status) query.set('status', status);
  if (qDebounced) query.set('q', qDebounced);

  const { data: items, error, reload } = useApi<TrackedItem[]>(`/tracking/items?${query}`);
  const { data: summary, reload: reloadSummary } = useApi<TrackingSummary>('/tracking/summary');
  const { data: vehicles, reload: reloadVehicles } = useApi<Vehicle[]>('/tracking/vehicles');
  const { data: users } = useApi<UserRef[]>('/users/directory');

  const setParam = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) v === null ? p.delete(k) : p.set(k, v);
    setParams(p, { replace: true });
  };
  const refresh = () => { void reload(); void reloadSummary(); void reloadVehicles(); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Süre Takibi</h1>
          <p className="sub">Kasko, sigorta, muayene, bakım, taahhüt, sözleşme ve kira bitişleri</p>
        </div>
        {canWrite && (tab === 'items'
          ? <button className="btn primary" onClick={() => setCreating({})}><Plus size={16} /> Kayıt</button>
          : <button className="btn primary" onClick={() => setCreatingVehicle(true)}><Plus size={16} /> Araç</button>)}
      </div>

      <div className="stats">
        <div className="glass stat"><small>Aktif</small><b>{summary?.active ?? '–'}</b></div>
        <div className="glass stat"><small>30 gün içinde</small><b>{summary?.in30 ?? '–'}</b></div>
        <div className="glass stat"><small>7 gün içinde</small><b className={summary?.in7 ? 'danger' : ''}>{summary?.in7 ?? '–'}</b></div>
        <div className="glass stat"><small>Süresi dolan</small><b className={summary?.expired ? 'danger' : ''}>{summary?.expired ?? '–'}</b></div>
      </div>

      <div className="tabs">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'items'} className={tab === 'items' ? 'on' : ''} onClick={() => setParam({ tab: null })}><ListChecks size={15} /> Kayıtlar</button>
          <button role="tab" aria-selected={tab === 'vehicles'} className={tab === 'vehicles' ? 'on' : ''} onClick={() => setParam({ tab: 'vehicles' })}><Car size={15} /> Araçlar</button>
        </div>
      </div>

      {tab === 'items' && (
        <>
          <div className="glass toolbar">
            <input className="grow" placeholder="Başlık, karşı taraf veya plaka ara…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Tür">
              <option value="">Tüm türler</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum">
              <option value="">Tüm durumlar</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="glass table-wrap">
            <table className="table">
              <thead><tr><th>Kalan</th><th>Başlık</th><th>Tür</th><th>Bitiş</th><th>Karşı taraf</th><th>Tutar</th><th>Sorumlu</th></tr></thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <tr key={i.id} onClick={() => setParam({ id: String(i.id) })} tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setParam({ id: String(i.id) })}>
                    <td><DaysLeft days={i.daysLeft} status={i.status as TrackStatus} /></td>
                    <td>{i.title}{i.vehicle && <span className="tag" style={{ marginLeft: 6 }}>{i.vehicle.plate}</span>}
                      {!!i.fileCount && <Paperclip size={12} style={{ marginLeft: 6, verticalAlign: 'middle' }} />}</td>
                    <td>{CATEGORY_LABEL[i.category as TrackCategory]}</td>
                    <td className="mono">{fmtDay(i.endDate)}</td>
                    <td>{i.counterparty ?? '—'}</td>
                    <td className="mono">{fmtMoney(i.amount, i.currency)}</td>
                    <td>{i.owner.fullName}</td>
                  </tr>
                ))}
                {items && items.length === 0 && <tr><td colSpan={7} className="empty">Kayıt yok</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'vehicles' && (
        <div className="glass table-wrap">
          <table className="table">
            <thead><tr><th>Plaka</th><th>Marka / model</th><th>Zimmetli</th><th>Kilometre</th><th>Son servis</th><th>Yaklaşan</th></tr></thead>
            <tbody>
              {(vehicles ?? []).map((v) => (
                <tr key={v.id} onClick={() => setParam({ vehicle: String(v.id) })} tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setParam({ vehicle: String(v.id) })}>
                  <td><b>{v.plate}</b></td>
                  <td>{v.brandModel ?? '—'}{v.year ? ` (${v.year})` : ''}</td>
                  <td>{v.assignedUser?.fullName ?? '—'}</td>
                  <td className="mono">{v.km !== null ? v.km.toLocaleString('tr-TR') : '—'}</td>
                  <td>{v.lastService ? `${v.lastService.type} · ${fmtDay(v.lastService.date)}` : '—'}</td>
                  <td>{v.nextDue ? <>{CATEGORY_LABEL[v.nextDue.category]} <DaysLeft days={v.nextDue.daysLeft} /></> : '—'}</td>
                </tr>
              ))}
              {vehicles && vehicles.length === 0 && <tr><td colSpan={6} className="empty">Araç yok</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && users && (
        <TrackedItemForm users={users} vehicles={vehicles ?? []} initialVehicleId={creating.vehicleId}
          onClose={() => setCreating(null)}
          onSaved={(it) => { setCreating(null); refresh(); setParam({ id: String(it.id) }); }} />
      )}
      {creatingVehicle && users && (
        <VehicleForm users={users} onClose={() => setCreatingVehicle(false)}
          onSaved={(v) => { setCreatingVehicle(false); refresh(); setParam({ vehicle: String(v.id) }); }} />
      )}
      {vehicleId && users && !openId && (
        <VehicleDrawer vehicleId={vehicleId} users={users} onClose={() => setParam({ vehicle: null })} onChanged={refresh}
          onOpenItem={(id) => setParam({ id: String(id) })}
          onNewItem={(vid) => setCreating({ vehicleId: vid })} />
      )}
      {openId && users && (
        <TrackedItemDrawer key={openId} itemId={openId} users={users} vehicles={vehicles ?? []}
          onClose={() => setParam({ id: null })} onChanged={refresh} onOpen={(id) => setParam({ id: String(id) })} />
      )}
    </>
  );
}
