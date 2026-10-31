import { useEffect, useState } from 'react';
import { storeGet, storeSet } from '../lib/storage';
import { BellRing, Share, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { enablePush, pushState } from '../lib/push';

const SNOOZE_KEY = 'ozg-push-prompt';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function snoozed() {
  return Date.now() - Number(storeGet(SNOOZE_KEY) ?? 0) < SNOOZE_MS;
}

/**
 * Bu cihazda bildirim kapalıysa sağ altta yüzen kart: tek dokunuşla açılır (izin isteği kullanıcı dokunuşuyla olmalı).
 * iPhone/iPad Safari'de bildirim yalnızca ana ekrana eklenen portalda çalışır; orada nasıl ekleneceği anlatılır.
 */
export function PushPrompt() {
  const [mode, setMode] = useState<'enable' | 'ios-install' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (snoozed()) return;
    if (!Capacitor.isNativePlatform() && isIos() && !isStandalone()) { setMode('ios-install'); return; }
    pushState().then((s) => setMode(s === 'off' ? 'enable' : null)).catch(() => undefined);
  }, []);

  if (!mode) return null;

  const later = () => {
    storeSet(SNOOZE_KEY, String(Date.now()));
    setMode(null);
  };

  const enable = async () => {
    setBusy(true); setErr('');
    try {
      const s = await enablePush();
      if (s === 'on') setMode(null);
      else setErr(s === 'denied' ? 'Bildirim izni verilmedi. Tarayıcı/cihaz ayarlarından izin verebilirsiniz.' : 'Bu cihaz bildirimleri desteklemiyor.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Bildirim açılamadı'); }
    finally { setBusy(false); }
  };

  return (
    <div className="glass push-prompt" role="region" aria-label="Bildirimler">
      <span className="push-prompt__ic">{mode === 'enable' ? <BellRing size={18} /> : <Share size={18} />}</span>
      <div className="push-prompt__text">
        {mode === 'enable' ? (
          <><b>Bildirimleri açın</b><small>Gelen aramalar, yeni görevler ve mesajlar portal kapalıyken de bu cihaza düşsün.</small></>
        ) : (
          <><b>Bildirim almak için ana ekrana ekleyin</b>
            <small>Safari'de <Share size={12} style={{ verticalAlign: '-2px' }} /> Paylaş → “Ana Ekrana Ekle” deyin, portalı oradaki simgeden açıp bildirimleri açın.</small></>
        )}
        {err && <small className="error">{err}</small>}
      </div>
      {mode === 'enable' && <button className="btn primary sm" disabled={busy} onClick={enable}>Aç</button>}
      <button className="icon-btn sm" title="Daha sonra" aria-label="Daha sonra" onClick={later}><X size={16} /></button>
    </div>
  );
}
