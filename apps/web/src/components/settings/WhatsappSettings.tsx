import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
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
  const { can } = useAuth();
  const { data: status, reload: reloadStatus } = useApi<WaStatus>('/whatsapp/status');
  const { data: templates, reload: reloadTemplates } = useApi<WaTemplate[]>('/whatsapp/templates');
  const { data: people, error } = useApi<Recipient[]>('/whatsapp/recipients');
  const reachable = people?.filter((p) => p.state === 'ok').length ?? 0;

  return (
    <>
      {can('notification.manage') && (
        <WaConnectionForm onSaved={() => { void reloadStatus(); void reloadTemplates(); }} />
      )}
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

interface WaSettingsData {
  phoneNumberId: string; wabaId: string; apiVersion: string; source: 'settings' | 'env' | 'none';
  accessTokenSet: boolean; appSecretSet: boolean; verifyTokenSet: boolean;
}
type WaSecretKey = 'accessToken' | 'appSecret' | 'verifyToken';

const SECRET_FIELDS: { key: WaSecretKey; label: string; hint: string }[] = [
  { key: 'accessToken', label: 'Erişim anahtarı (Access token)', hint: 'Meta Business → Sistem kullanıcısı için oluşturulan kalıcı anahtar' },
  { key: 'appSecret', label: 'Uygulama gizli anahtarı (App secret)', hint: 'Webhook imzasını doğrulamak için (Uygulama ayarları → Temel)' },
  { key: 'verifyToken', label: 'Webhook doğrulama anahtarı (Verify token)', hint: "Kendiniz belirleyin; Meta'daki webhook ayarına da aynısını yazın" },
];

/** Meta WhatsApp Cloud API bağlantı bilgileri. Gizli alanlar sunucuda şifreli saklanır, ekrana geri gelmez. */
function WaConnectionForm({ onSaved }: { onSaved: () => void }) {
  const { data, setData, error } = useApi<WaSettingsData>('/whatsapp/settings');
  const [f, setF] = useState({ phoneNumberId: '', wabaId: '', apiVersion: 'v21.0' });
  const [secrets, setSecrets] = useState<Record<WaSecretKey, string>>({ accessToken: '', appSecret: '', verifyToken: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const webhookUrl = `${location.origin}/api/whatsapp/webhook`;

  useEffect(() => {
    if (data) setF({ phoneNumberId: data.phoneNumberId, wabaId: data.wabaId, apiVersion: data.apiVersion });
  }, [data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      // Boş bırakılan gizli alanlar gönderilmez: kayıtlı değer korunur.
      const filled = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim()));
      setData(await api<WaSettingsData>('/whatsapp/settings', json('PUT', { ...f, ...filled })));
      setSecrets({ accessToken: '', appSecret: '', verifyToken: '' });
      setMsg({ ok: true, text: 'Kaydedildi' });
      onSaved();
    } catch (x) { setMsg({ ok: false, text: x instanceof Error ? x.message : 'Kaydedilemedi' }); }
    finally { setBusy(false); }
  };

  const copyWebhook = () => {
    void navigator.clipboard?.writeText(webhookUrl).then(
      () => setMsg({ ok: true, text: 'Webhook adresi kopyalandı' }),
      () => setMsg({ ok: false, text: 'Kopyalanamadı; adresi elle seçin' }),
    );
  };

  return (
    <section className="glass panel narrow">
      <h3>WhatsApp bağlantısı (Meta Cloud API)</h3>
      <p className="sub small">Bilgiler Meta for Developers → uygulamanız → WhatsApp → API Setup ekranında bulunur.</p>
      {error && <p className="error">{error}</p>}
      {data && (
        <form className="form" onSubmit={submit}>
          <label>Telefon numarası kimliği (Phone number ID)
            <input required inputMode="numeric" pattern="[0-9]{5,30}" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} />
          </label>
          <div className="row">
            <label>İşletme hesabı kimliği (WABA ID)
              <input inputMode="numeric" pattern="[0-9]{5,30}" placeholder="Onaylı şablonları çekmek için" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} />
            </label>
            <label style={{ flex: '0 0 110px' }}>API sürümü
              <input pattern="v[0-9]{1,3}\.[0-9]{1,2}" value={f.apiVersion} onChange={(e) => setF({ ...f, apiVersion: e.target.value })} />
            </label>
          </div>
          {SECRET_FIELDS.map(({ key, label, hint }) => (
            <label key={key}>{label}
              <input type="password" autoComplete="new-password" value={secrets[key]}
                onChange={(e) => setSecrets({ ...secrets, [key]: e.target.value })}
                placeholder={data[`${key}Set`] ? 'Kayıtlı — değiştirmek için yazın' : ''} />
              <span className="hint">{hint}</span>
            </label>
          ))}
          <label>Webhook adresi (Meta'ya girilecek)
            <div className="inline-form">
              <input readOnly value={webhookUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn ghost sm" onClick={copyWebhook}><Copy size={14} /> Kopyala</button>
            </div>
          </label>
          {data.source === 'env' && <p className="hint">Şu an sunucu yapılandırma dosyasındaki ayarlar kullanılıyor; kaydettiğinizde bu ekrandaki ayarlar geçerli olur.</p>}
          <div className="actions"><button className="btn primary sm" disabled={busy}>Kaydet</button></div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
