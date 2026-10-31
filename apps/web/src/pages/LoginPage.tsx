import { useEffect, useState, type FormEvent } from 'react';
import { storeGet, storeSet } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { BrandLogo } from '../components/BrandLogo';

const PLAYED = 'ozg-logo-played';
/** "Beni hatırla" seçilince e-posta da hatırlanır (şifre hiçbir zaman saklanmaz). */
const REMEMBERED_EMAIL = 'ozg-remember-email';
const readRemembered = () => storeGet(REMEMBERED_EMAIL) ?? '';

/**
 * Logo kurulma animasyonu yalnızca ilk açılışta oynar; çıkış yapıp geri dönünce veya sayfa yenilenince logo hazır görünür.
 * Karar sayfa yüklemesi başına bir kez verilir (StrictMode'un çift çağrısı sonucu değiştirmesin).
 */
let decided: boolean | null = null;
function firstOpen() {
  if (decided === null) {
    decided = true;
    try {
      if (sessionStorage.getItem(PLAYED)) decided = false;
      else sessionStorage.setItem(PLAYED, '1');
    } catch { /* depolama kapalıysa sayfa her açılışta oynar */ }
  }
  return decided;
}

export function LoginPage() {
  const { login } = useAuth();
  const [animate] = useState(firstOpen);
  useEffect(() => () => { decided = false; }, []);
  const [email, setEmail] = useState(readRemembered);
  const [remember, setRemember] = useState(() => !!readRemembered());
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await login(email, password, remember);
      storeSet(REMEMBERED_EMAIL, remember ? email.trim() : null);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Giriş başarısız'); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <section className={'login-hero' + (animate ? ' is-intro' : '')}>
        <BrandLogo emblem animate={animate} className="login-logo" />
      </section>
      <form className="glass login" onSubmit={submit}>
        <div className="login-head">
          <h2>Giriş yap</h2>
          <p>Şirket e-posta adresinizle devam edin</p>
        </div>
        <label>E-posta<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Şifre<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label className="check login-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Beni hatırla
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
      </form>
    </div>
  );
}
