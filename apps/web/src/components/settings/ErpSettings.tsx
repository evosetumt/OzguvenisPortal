import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { timeAgo } from '../../lib/format';
import { ENTITY_LABEL, type ErpStatus } from '../../lib/types-erp';
import '../../styles/erp.css';

/** Netsis bağlantı durumu ve senkron geçmişi (erp.manage). */
export function ErpSettings() {
  const { can } = useAuth();
  if (!can('erp.manage')) return null;
  return <ErpPanel />;
}

function ErpPanel() {
  const { data: s, error, reload } = useApi<ErpStatus>('/erp/status');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  // Senkron sürerken durumu 2 sn'de bir yenile.
  useEffect(() => {
    if (!s?.running) return;
    const h = setInterval(() => void reload(), 2000);
    return () => clearInterval(h);
  }, [s?.running, reload]);

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ started: boolean }>('/erp/sync', json('POST'));
      setMsg(r.started ? { ok: true, text: 'Senkron başlatıldı' } : { ok: false, text: 'Zaten çalışan bir senkron var' });
      await reload();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Başlatılamadı' }); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ ok: boolean; database?: string; error?: string }>('/erp/test', json('POST'));
      setMsg(r.ok ? { ok: true, text: `Bağlantı başarılı: ${r.database}` } : { ok: false, text: `Bağlantı hatası: ${r.error}` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Test edilemedi' }); }
    setBusy(false);
  };

  return (
    <section className="glass panel">
      <h3>Netsis entegrasyonu
        {s?.configured && (
          <span className="push erp-actions">
            <button className="btn ghost sm" disabled={busy} onClick={() => setEditing((v) => !v)}><Settings2 size={14} /> Bağlantı ayarları</button>
            <button className="btn ghost sm" disabled={busy} onClick={test}>Bağlantıyı test et</button>
            <button className="btn primary sm" disabled={busy || s.running} onClick={sync}>
              <RefreshCw size={14} className={s.running ? 'spin' : ''} /> {s.running ? 'Senkronlanıyor…' : 'Şimdi senkronla'}
            </button>
          </span>
        )}
      </h3>
      {error && <p className="error">{error}</p>}
      {s && !s.configured && <p className="sub small">Netsis bağlantısı henüz girilmemiş. SQL Server bilgilerini girip kaydedin; ardından bağlantıyı test edip senkronu başlatabilirsiniz.</p>}
      {s && (!s.configured || editing) && (
        <NetsisConnectionForm onSaved={async () => { setEditing(false); setMsg({ ok: true, text: 'Bağlantı ayarları kaydedildi' }); await reload(); }} />
      )}
      {s?.configured && (
        <>
          <dl className="props erp-props">
            <dt>Sunucu</dt><dd>{s.connection?.server}:{s.connection?.port} · {s.connection?.database} ({s.connection?.user}, salt okunur)</dd>
            <dt>Zamanlama</dt><dd>{s.intervalMinutes ? `${s.intervalMinutes} dakikada bir` : 'Otomatik senkron kapalı'} · son {s.windowDays} gün</dd>
            <dt>Önbellek</dt><dd>{s.counts.customers} cari · {s.counts.orders} sipariş · {s.counts.quotes} teklif · {s.counts.shipments} sevk · {s.counts.accountTx} hareket</dd>
          </dl>
          {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
          <h4>Son çalışmalar</h4>
          <div className="table-wrap">
            <table className="table static">
              <thead><tr><th>Varlık</th><th>Başlangıç</th><th>Tetik</th><th>Durum</th><th className="num">Satır</th><th>Hata</th></tr></thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{ENTITY_LABEL[r.entity] ?? r.entity}</td>
                    <td>{timeAgo(r.startedAt)}</td>
                    <td>{r.trigger === 'manual' ? 'Elle' : 'Zamanlı'}</td>
                    <td><span className={'erp-run ' + r.status}>{r.status === 'ok' ? 'Tamam' : r.status === 'failed' ? 'Hata' : 'Sürüyor'}</span></td>
                    <td className="num">{r.rows}</td>
                    <td className="erp-error" title={r.error ?? ''}>{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!s.runs.length && <p className="empty">Henüz senkron çalışmadı.</p>}
        </>
      )}
    </section>
  );
}

interface NetsisConfig {
  server: string; port: number; database: string; user: string; encrypt: boolean; trustServerCertificate: boolean;
  passwordSet: boolean; source: 'settings' | 'env' | 'none';
}

/** Netsis SQL Server bağlantısı. Şifre sunucuda şifreli saklanır, ekrana geri gelmez. */
function NetsisConnectionForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const { data, error } = useApi<NetsisConfig>('/erp/connection');
  const [f, setF] = useState({ server: '', port: '1433', database: '', user: '', encrypt: true, trustServerCertificate: true });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setF({
      server: data.server, port: String(data.port), database: data.database, user: data.user,
      encrypt: data.encrypt, trustServerCertificate: data.trustServerCertificate,
    });
  }, [data]);

  const set = (k: 'server' | 'port' | 'database' | 'user') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/erp/connection', json('PUT', { ...f, port: Number(f.port), ...(password ? { password } : {}) }));
      setPassword('');
      await onSaved();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Kaydedilemedi'); }
    finally { setBusy(false); }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return null;
  return (
    <form className="form narrow" onSubmit={submit}>
      <div className="row">
        <label>Sunucu<input required placeholder="10.0.0.5 veya SUNUCU\NETSIS" value={f.server} onChange={set('server')} /></label>
        <label style={{ flex: '0 0 96px' }}>Port<input type="number" required min={1} max={65535} value={f.port} onChange={set('port')} /></label>
      </div>
      <label>Veritabanı<input required placeholder="ör. NETSIS_2026" value={f.database} onChange={set('database')} /></label>
      <label>Kullanıcı<input required autoComplete="off" value={f.user} onChange={set('user')} /></label>
      <label>Şifre
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={data.passwordSet ? 'Kayıtlı — değiştirmek için yazın' : ''} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.encrypt} onChange={(e) => setF({ ...f, encrypt: e.target.checked })} /> Şifreli bağlantı (encrypt)
      </label>
      <label className="check">
        <input type="checkbox" checked={f.trustServerCertificate} onChange={(e) => setF({ ...f, trustServerCertificate: e.target.checked })} />
        Sunucu sertifikasına güven (iç ağdaki SQL Server için genellikle açık)
      </label>
      <p className="hint">
        Kullanıcının Netsis veritabanında yalnız okuma yetkisi (db_datareader) olmalı; portal Netsis'e hiçbir zaman yazmaz.
        Adlandırılmış örnekte (SUNUCU\ÖRNEK) port kullanılmaz.
      </p>
      {data.source === 'env' && <p className="hint">Şu an sunucu yapılandırma dosyasındaki ayarlar kullanılıyor; kaydettiğinizde bu ekrandaki ayarlar geçerli olur.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions"><button className="btn primary sm" disabled={busy}>Kaydet</button></div>
    </form>
  );
}
