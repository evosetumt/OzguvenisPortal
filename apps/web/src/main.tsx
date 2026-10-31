import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { initTheme } from './lib/theme';
import { registerServiceWorker, requestNotificationPermission } from './lib/push';
import { initEffects } from './lib/effects';
import { initFitText } from './lib/fit-text';
import { initKeyboardTracking } from './lib/keyboard';
import { Capacitor } from '@capacitor/core';
import './styles/theme.css';
import './styles/app.css';
import './styles/components.css';
import './styles/appearance.css';

// Android'de (uygulama ve Chrome) bulanıklık efektleri kapatılır; kaydırma akıcı kalsın (app.css → .lite-fx).
if (Capacitor.getPlatform() === 'android' || /Android/i.test(navigator.userAgent)) document.documentElement.classList.add('lite-fx');

initTheme();
initEffects();
initFitText(); // istatistik kartlarındaki uzun tutarlar kutuya sığsın
initKeyboardTracking(); // telefonda klavye açılınca sohbetin yazma kutusu klavyenin üstünde kalsın
void registerServiceWorker(); // push bildirimleri için (tarayıcı desteklemiyorsa sessizce atlanır)
void requestNotificationPermission(); // mobil uygulama: açılışta bildirim izni (tarayıcıda bir şey yapmaz)

// HashRouter: IIS'te URL Rewrite ayarı gerektirmez, Capacitor ile de uyumludur.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
