import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';

interface MailConfig {
  host: string; port: number; secure: boolean; user: string; from: string; portalUrl: string;
  passwordSet: boolean; source: 'settings' | 'env' | 'none';
}

/** Ayarlar → Bildirim kuralları: e-posta kanalının SMTP sunucusu. Şifre sunucuda şifreli saklanır, ekrana geri gelmez. */
export function MailSettings() {
  const { data, setData, error } = useApi<MailConfig>('/notifications/mail');
  const [f, setF] = useState({ host: '', port: '587', secure: false, user: '', from: '', portalUrl: '' });
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setF({
      host: data.host, port: String(data.port), secure: data.secure, user: data.user, from: data.from,
      portalUrl: data.portalUrl || `${location.protocol}//${location.host}`,
    });
  }, [data]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const body = { ...f, port: Number(f.port), ...(password ? { password } : {}) };
      setData(await api<MailConfig>('/notifications/mail', json('PUT', body)));
      setPassword('');
      setMsg({ ok: true, text: 'Kaydedildi' });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Kaydedilemedi' }); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ to: string }>('/notifications/mail/test', json('POST', testTo.trim() ? { to: testTo.trim() } : {}));
      setMsg({ ok: true, text: `Deneme e-postası gönderildi: ${r.to}` });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Gönderilemedi' }); }
    finally { setBusy(false); }
  };

  return (
    <section className="glass panel narrow">
      <h3>E-posta sunucusu (SMTP)</h3>
      <p className="sub small">Bildirim kurallarında “E-posta” seçili olaylar bu sunucu üzerinden kullanıcının kayıtlı e-posta adresine gönderilir.</p>
      {error && <p className="error">{error}</p>}
      {data && (
        <form className="form" onSubmit={submit}>
          <div className="row">
            <label>Sunucu<input required placeholder="smtp.ornek.com" value={f.host} onChange={set('host')} /></label>
            <label style={{ flex: '0 0 96px' }}>Port<input type="number" required min={1} max={65535} value={f.port} onChange={set('port')} /></label>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.secure}
              onChange={(e) => setF({ ...f, secure: e.target.checked, port: e.target.checked ? '465' : f.port === '465' ? '587' : f.port })} />
            SSL/TLS bağlantı (port 465). Kapalıysa STARTTLS (port 587) kullanılır.
          </label>
          <label>Kullanıcı adı<input autoComplete="off" value={f.user} onChange={set('user')} /></label>
          <label>Şifre
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={data.passwordSet ? 'Kayıtlı — değiştirmek için yazın' : ''} />
          </label>
          <label>Gönderen<input required placeholder="Özgüveniş Portal <portal@ozguvenis.com.tr>" value={f.from} onChange={set('from')} /></label>
          <label>Portal adresi (e-postadaki bağlantı)<input value={f.portalUrl} onChange={set('portalUrl')} /></label>
          {data.source === 'env' && <p className="hint">Şu an sunucu ortam değişkenlerindeki ayarlar kullanılıyor; kaydettiğinizde bu ekrandaki ayarlar geçerli olur.</p>}
          <label>Deneme alıcısı<input type="email" placeholder="Boş bırakılırsa kendi adresiniz" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></label>
          <div className="actions">
            <button type="button" className="btn ghost sm" disabled={busy || data.source === 'none'} onClick={test}><Send size={14} /> Deneme gönder</button>
            <button className="btn primary sm" disabled={busy}>Kaydet</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
