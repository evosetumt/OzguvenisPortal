import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Lock, Plus, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { Modal } from '../Modal';

type Scope = 'own' | 'department' | 'all';
interface PermissionDef { code: string; label: string; scopes: Scope[] }
interface ModuleDef { key: string; label: string; financial?: boolean; permissions: PermissionDef[] }
interface RoleRow { id: number; name: string; description: string | null; userCount: number; locked: boolean; permissions: Record<string, Scope> }

const SCOPE_LABEL: Record<Scope, string> = {
  own: 'Yalnızca kendi kayıtları',
  department: 'Departmanı (Netsis: plasiyeri)',
  all: 'Tümü',
};

/**
 * Roller ve modül yetkileri (user.manage). Her rol için modül modül: erişim yok / kendi / departman / tümü.
 * Finansal modüller (cari, sipariş/teklif, masraf, ödeme) işaretlidir. Kaydedince o roldeki kullanıcıların
 * açık oturumları hemen güncellenir. Admin rolü her zaman tam yetkilidir.
 */
export function RolesSettings() {
  const { data: catalog } = useApi<ModuleDef[]>('/permissions/catalog');
  const { data: roles, setData: setRoles, reload, error } = useApi<RoleRow[]>('/roles');
  const [roleId, setRoleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, Scope | null>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (roles?.length && !roles.some((r) => r.id === roleId)) setRoleId(roles.find((r) => !r.locked)?.id ?? roles[0].id);
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = roles?.find((r) => r.id === roleId) ?? null;
  useEffect(() => { setDraft({}); setMsg(null); }, [roleId]);

  const value = (code: string): Scope | null => (code in draft ? draft[code] : role?.permissions[code] ?? null);
  const changed = useMemo(() => Object.entries(draft).filter(([c, s]) => (role?.permissions[c] ?? null) !== s), [draft, role]);
  const set = (code: string, s: Scope | null) => setDraft((d) => ({ ...d, [code]: s }));
  const setModule = (m: ModuleDef, on: boolean) => setDraft((d) => {
    const n = { ...d };
    // Açınca her izin rolün en dar kapsamıyla başlar (sonra tek tek genişletilir).
    for (const p of m.permissions) n[p.code] = on ? p.scopes[0] : null;
    return n;
  });

  const save = async () => {
    if (!role || !changed.length) return;
    setBusy(true); setMsg(null);
    try {
      const updated = await api<RoleRow>(`/roles/${role.id}`, json('PATCH', { permissions: Object.fromEntries(changed) }));
      setRoles((rs) => rs && rs.map((r) => (r.id === updated.id ? updated : r)));
      setDraft({});
      setMsg({ ok: true, text: `Kaydedildi. ${role.userCount ? `Bu roldeki ${role.userCount} kişinin açık oturumu hemen güncellendi.` : ''}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!role || !window.confirm(`"${role.name}" rolü silinsin mi?`)) return;
    try { await api(`/roles/${role.id}`, json('DELETE')); setRoleId(null); void reload(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Silinemedi' }); }
  };

  if (error) return <p className="error">{error}</p>;
  if (!catalog || !roles) return <p className="empty">Yükleniyor…</p>;

  return (
    <section className="glass panel roles">
      <div className="roles-head">
        <h3><ShieldCheck size={18} /> Roller ve yetkiler</h3>
        <button className="btn sm" onClick={() => setCreating(true)}><Plus size={14} /> Yeni rol</button>
      </div>
      <p className="hint">Kullanıcı hangi modülleri göreceğini rolünden alır; bir kişinin birden fazla rolü varsa en geniş yetki geçerlidir. Rol atamak için: Kullanıcılar sekmesi.</p>

      <div className="roles-picker" role="tablist" aria-label="Roller">
        {roles.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === roleId} className={r.id === roleId ? 'on' : ''} onClick={() => setRoleId(r.id)}>
            {r.locked && <Lock size={12} />} {r.name} <small>{r.userCount} kişi</small>
          </button>
        ))}
      </div>

      {role && (
        <>
          {role.locked && <p className="hint roles-locked"><Lock size={13} /> Admin rolü her zaman tüm modüllere tam yetkilidir ve değiştirilemez.</p>}
          <div className="roles-modules">
            {catalog.map((m) => {
              const on = m.permissions.some((p) => value(p.code));
              return (
                <div key={m.key} className={'roles-module' + (on ? ' on' : '')}>
                  <div className="roles-module-head">
                    <b>{m.label}</b>
                    {m.financial && <span className="tag fin"><Wallet size={11} /> Finansal</span>}
                    <label className="switch" title={on ? 'Modülü kapat' : 'Modülü aç'}>
                      <input type="checkbox" checked={on} disabled={role.locked} onChange={(e) => setModule(m, e.target.checked)} />
                      <span>{on ? 'Açık' : 'Kapalı'}</span>
                    </label>
                  </div>
                  {on && m.permissions.map((p) => (
                    <div key={p.code} className="roles-perm">
                      <span>{p.label}</span>
                      {p.scopes.length === 1 && p.scopes[0] === 'all' ? (
                        <label className="check">
                          <input type="checkbox" checked={!!value(p.code)} disabled={role.locked} onChange={(e) => set(p.code, e.target.checked ? 'all' : null)} /> Var
                        </label>
                      ) : (
                        <select value={value(p.code) ?? ''} disabled={role.locked} onChange={(e) => set(p.code, (e.target.value || null) as Scope | null)}>
                          <option value="">Erişim yok</option>
                          {p.scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {!role.locked && (
            <div className="actions roles-actions">
              {role.userCount === 0 && <button className="btn ghost sm" onClick={remove}><Trash2 size={14} /> Rolü sil</button>}
              <span className="push" />
              {changed.length > 0 && <button className="btn ghost sm" onClick={() => setDraft({})}>Vazgeç</button>}
              <button className="btn primary sm" disabled={!changed.length || busy} onClick={save}>
                {busy ? 'Kaydediliyor…' : changed.length ? `Kaydet (${changed.length} değişiklik)` : 'Kaydet'}
              </button>
            </div>
          )}
          {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        </>
      )}
      {creating && <NewRole onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); void reload().then(() => setRoleId(id)); }} />}
    </section>
  );
}

function NewRole({ onClose, onCreated }: { onClose(): void; onCreated(id: number): void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { onCreated((await api<{ id: number }>('/roles', json('POST', { name }))).id); } catch (err) { setError(err instanceof Error ? err.message : 'Oluşturulamadı'); }
  };
  return (
    <Modal title="Yeni rol" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Rol adı<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Satış Temsilcisi" /></label>
        <p className="hint">Yeni rol hiçbir modüle erişimle başlamaz; oluşturduktan sonra modülleri açın.</p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary">Oluştur</button>
        </div>
      </form>
    </Modal>
  );
}
