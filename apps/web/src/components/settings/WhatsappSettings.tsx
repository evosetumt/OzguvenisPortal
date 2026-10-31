import { CheckCircle2, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../lib/data';
import { timeAgo } from '../../lib/format';
import { WA_STATUS_LABEL, type WaMsgStatus, type WaStatus, type WaTemplate } from '../../lib/types-tracking';
import '../../styles/settings.css';

interface Recipient {
  id: number; fullName: string; phone: string | null; normalized: string | null;
  state: 'ok' | 'no-phone' | 'invalid' | 'opted-out';
  last: { status: WaMsgStatus; templateName: string | null; error: string | null; createdAt: string } | null;
}

const STATE_LABEL: Record<Recipient['state'], string> = {
  ok: 'Gönderilebilir', 'no-phone': 'Telefon yok', invalid: 'Geçersiz numara', 'opted-out': 'Bildirimleri durdurmuş',
};

const fmtPhone = (p: string) => (p.startsWith('90') && p.length === 12 ? `+90 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}` : `+${p}`);

/**
 * Ayarlar → WhatsApp: bağlantı durumu, bildirim şablonları ve alıcılar. Elle mesaj gönderilmez; bildirim kurallarında
 * WhatsApp seçili olaylar kullanıcının Kullanıcılar ekranındaki telefonuna otomatik gider.
 */
export function WhatsappSettings() {
  const [, setParams] = useSearchParams();
  const { data: status } = useApi<WaStatus>('/whatsapp/status');
  const { data: templates } = useApi<WaTemplate[]>('/whatsapp/templates');
  const { data: people, error } = useApi<Recipient[]>('/whatsapp/recipients');
  const reachable = people?.filter((p) => p.state === 'ok').length ?? 0;

  return (
    <>
      <section className="glass panel">
        <h3>WhatsApp Business
          {status && (status.configured
            ? <span className="chip static on-ok push"><CheckCircle2 size={13} /> Bağlı</span>
            : <span className="chip static off push"><XCircle size={13} /> Yapılandırılmamış</span>)}
        </h3>
        <p className="sub small">
          Bildirim kurallarında WhatsApp seçili olaylar (ör. görev atandı), Meta'da onaylı şablonla kullanıcının kayıtlı telefonuna otomatik gönderilir.
          Hangi olayın WhatsApp'tan gideceğini <button className="link-btn" onClick={() => setParams({ tab: 'rules' })}>Bildirim kuralları</button> sekmesinden seçebilirsiniz.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Olay</th><th>Şablon</th><th>Durum</th></tr></thead>
            <tbody>
              {status?.eventTemplates.map((t) => {
                const ok = templates?.some((x) => x.name === t.name && x.language === t.language);
                return (
                  <tr key={t.name} className="static">
                    <td>{t.label}</td>
                    <td><code>{t.name}</code></td>
                    <td>{templates ? (ok ? <span className="ok">Onaylı</span> : <span className="error">Meta'da onaylı değil</span>) : '…'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass panel">
        <h3>Alıcılar{people && <span className="muted push small">{reachable} / {people.length} kullanıcıya gönderilebilir</span>}</h3>
        <p className="sub small">
          Numaralar <button className="link-btn" onClick={() => setParams({ tab: 'users' })}>Kullanıcılar</button> sekmesindeki telefon alanından alınır;
          ayrıca kişi eklemeye gerek yoktur. Numarası olmayan kullanıcıya WhatsApp gitmez (uygulama içi ve e-posta bildirimi yine gider).
        </p>
        {error && <p className="error">{error}</p>}
        {people && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kullanıcı</th><th>Telefon</th><th>Durum</th><th>Son mesaj</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="static">
                    <td>{p.fullName}</td>
                    <td>{p.normalized ? fmtPhone(p.normalized) : p.phone ?? <span className="muted">–</span>}</td>
                    <td><span className={p.state === 'ok' ? 'ok' : p.state === 'no-phone' ? 'muted' : 'error'}>{STATE_LABEL[p.state]}</span></td>
                    <td title={p.last?.error ?? undefined}>
                      {p.last
                        ? <><span className={p.last.status === 'failed' ? 'error' : ''}>{WA_STATUS_LABEL[p.last.status]}</span> <small className="muted">· {timeAgo(p.last.createdAt)}</small></>
                        : <span className="muted">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
