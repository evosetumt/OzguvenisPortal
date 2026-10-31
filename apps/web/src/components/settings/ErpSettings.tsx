import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
            <button className="btn ghost sm" disabled={busy} onClick={test}>Bağlantıyı test et</button>
            <button className="btn primary sm" disabled={busy || s.running} onClick={sync}>
              <RefreshCw size={14} className={s.running ? 'spin' : ''} /> {s.running ? 'Senkronlanıyor…' : 'Şimdi senkronla'}
            </button>
          </span>
        )}
      </h3>
      {error && <p className="error">{error}</p>}
      {s && !s.configured && (
        <p className="empty">Netsis bağlantısı yapılandırılmamış. Sunucudaki <code>apps/api/.env</code> dosyasına NETSIS_DB_* değerlerini girin (bkz. docs/moduller/netsis.md).</p>
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
