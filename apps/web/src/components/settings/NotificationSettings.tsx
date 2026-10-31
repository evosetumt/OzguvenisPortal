import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import '../../styles/settings.css';

type Channel = 'inapp' | 'push' | 'email' | 'whatsapp';
const CHANNEL_LABEL: Record<Channel, string> = { inapp: 'Uygulama içi', push: 'Anlık (push)', email: 'E-posta', whatsapp: 'WhatsApp' };
const ALL: Channel[] = ['inapp', 'push', 'email', 'whatsapp'];

interface Pref { eventCode: string; label: string; available: Channel[]; channels: Channel[] }
interface Rule { eventCode: string; label: string; channels: Channel[]; isActive: boolean }
interface RulesResp { rules: Rule[]; channels: { channel: Channel; configured: boolean }[] }

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: 'Bu tarayıcı anlık bildirimi desteklemiyor.',
  unconfigured: 'Bu cihaz için bildirim altyapısı henüz yapılandırılmamış (Firebase).',
  denied: 'Bildirim izni engellenmiş; tarayıcı/cihaz ayarlarından izin verin.',
  off: 'Bu cihaz anlık bildirim almıyor.',
  on: 'Bu cihaz anlık bildirim alıyor.',
};

export function NotificationSettings({ part }: { part: 'mine' | 'rules' }) {
  const { can } = useAuth();
  if (part === 'rules') return can('notification.manage') ? <RulesAdmin /> : null;
  return <MyNotifications />;
}

function MyNotifications() {
  const { data: prefs, setData, error } = useApi<Pref[]>('/notifications/prefs');
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { pushState().then(setPush).catch(() => setPush('unsupported')); }, []);

  const togglePush = async () => {
    setBusy(true); setMsg(null);
    try { setPush(push === 'on' ? await disablePush() : await enablePush()); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'İşlem başarısız' }); }
    finally { setBusy(false); }
  };

  const toggle = async (p: Pref, c: Channel) => {
    const channels = p.channels.includes(c) ? p.channels.filter((x) => x !== c) : [...p.channels, c];
    const prev = prefs;
    setData((prefs ?? []).map((x) => (x.eventCode === p.eventCode ? { ...x, channels } : x)));
    try { setData(await api<Pref[]>('/notifications/prefs', json('PUT', { items: [{ eventCode: p.eventCode, channels }] }))); }
    catch (e) { setData(prev); setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' }); }
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ results: { channel: Channel; status: string; error?: string }[] }>('/notifications/test', json('POST'));
      const parts = r.results.map((x) => `${CHANNEL_LABEL[x.channel]}: ${x.status === 'sent' ? 'gönderildi' : x.status === 'skipped' ? 'yapılandırılmamış' : `hata (${x.error})`}`);
      setMsg({ ok: !r.results.some((x) => x.status === 'failed'), text: ['Uygulama içi: gönderildi', ...parts].join(' · ') });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gönderilemedi' }); }
    finally { setBusy(false); }
  };

  const used = ALL.filter((c) => (prefs ?? []).some((p) => p.available.includes(c)));

  return (
    <section className="glass panel">
      <h3>Bildirimlerim</h3>
      <div className="push-row">
        {push === 'on' ? <Bell size={18} className="ok-ic" /> : <BellOff size={18} className="muted-ic" />}
        <span>{push ? PUSH_TEXT[push] : 'Kontrol ediliyor…'}</span>
        {(push === 'on' || push === 'off') && (
          <button className={'btn sm ' + (push === 'on' ? 'ghost' : 'primary')} disabled={busy} onClick={togglePush}>
            {push === 'on' ? 'Kapat' : 'Bu cihazda aç'}
          </button>
        )}
        <button className="btn ghost sm push" disabled={busy} onClick={test}><Send size={14} /> Deneme gönder</button>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      {error && <p className="error">{error}</p>}
      {prefs && prefs.length > 0 && (
        <div className="table-wrap">
          <table className="table pref-matrix">
            <thead><tr><th>Olay</th>{used.map((c) => <th key={c}>{CHANNEL_LABEL[c]}</th>)}</tr></thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.eventCode} className="static">
                  <td>{p.label}</td>
                  {used.map((c) => (
                    <td key={c}>
                      {p.available.includes(c)
                        ? <input type="checkbox" aria-label={`${p.label} – ${CHANNEL_LABEL[c]}`} checked={p.channels.includes(c)} onChange={() => toggle(p, c)} />
                        : <span className="muted">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub small">Yalnızca yöneticinin ilgili olay için açtığı kanallar seçilebilir.</p>
    </section>
  );
}

function RulesAdmin() {
  const { data, setData, error } = useApi<RulesResp>('/notifications/rules');
  const [err, setErr] = useState('');

  const save = async (r: Rule, patch: Partial<Rule>) => {
    const next = { ...r, ...patch };
    if (!next.channels.length) { setErr('En az bir kanal seçili olmalı'); return; }
    setErr('');
    const prev = data;
    setData(data && { ...data, rules: data.rules.map((x) => (x.eventCode === r.eventCode ? next : x)) });
    try { await api(`/notifications/rules/${encodeURIComponent(r.eventCode)}`, json('PUT', { channels: next.channels, isActive: next.isActive })); }
    catch (e) { setData(prev); setErr(e instanceof Error ? e.message : 'Kaydedilemedi'); }
  };

  return (
    <section className="glass panel">
      <h3>Bildirim kuralları</h3>
      <p className="sub small">Hangi olayın hangi kanallardan gideceği. Alıcılar olay türüne göre sistemde tanımlıdır (atanan kişi, görevi açan, davetliler…).</p>
      {data && (
        <div className="chips channel-status">
          {data.channels.map((c) => (
            <span key={c.channel} className={'chip static ' + (c.configured ? 'on-ok' : 'off')}>
              {CHANNEL_LABEL[c.channel]}: {c.configured ? 'hazır' : 'yapılandırılmamış'}
            </span>
          ))}
        </div>
      )}
      {(error || err) && <p className="error">{error || err}</p>}
      {data && (
        <div className="table-wrap">
          <table className="table pref-matrix">
            <thead><tr><th>Olay</th><th>Etkin</th>{ALL.map((c) => <th key={c}>{CHANNEL_LABEL[c]}</th>)}</tr></thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.eventCode} className={'static' + (r.isActive ? '' : ' inactive')}>
                  <td>{r.label}<small className="code">{r.eventCode}</small></td>
                  <td><input type="checkbox" aria-label={`${r.label} etkin`} checked={r.isActive} onChange={() => save(r, { isActive: !r.isActive })} /></td>
                  {ALL.map((c) => (
                    <td key={c}>
                      <input type="checkbox" aria-label={`${r.label} – ${CHANNEL_LABEL[c]}`} disabled={!r.isActive} checked={r.channels.includes(c)}
                        onChange={() => save(r, { channels: r.channels.includes(c) ? r.channels.filter((x) => x !== c) : [...r.channels, c] })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
