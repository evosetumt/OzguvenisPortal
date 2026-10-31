import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';

/** Ödeme takibi: vadeden kaç gün önce görev açılacağı (kayıtta ayrı süre verilmemişse). payment.manage: all. */
export function PaymentSettings() {
  const { data, setData } = useApi<{ defaultLeadDays: number }>('/payments/settings');
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (data) setDays(String(data.defaultLeadDays)); }, [data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      setData(await api<{ defaultLeadDays: number }>('/payments/settings', json('PUT', { defaultLeadDays: Number(days) })));
      setMsg({ ok: true, text: 'Kaydedildi; ön süresi gelen ödemelerin görevleri açıldı' });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Kaydedilemedi' }); }
  };

  return (
    <section className="glass panel narrow">
      <h3>Ödeme takibi</h3>
      <form className="form" onSubmit={submit}>
        <label>Vadeden kaç gün önce görev açılsın
          <input type="number" min={0} max={90} required value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <p className="hint">
          Çek, kredi kartı, vergi gibi ödemelerin görevi bu kadar gün önce sorumlu birimin yöneticisine düşer; yönetici görevi istediği kişiye verir.
          Kayıtta ayrı bir süre girilmişse o geçerlidir.
        </p>
        <div className="actions"><button className="btn primary sm">Kaydet</button></div>
      </form>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
