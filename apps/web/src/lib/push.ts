import { Capacitor } from '@capacitor/core';
import { storeGet, storeSet } from './storage';
import { api } from './api';
import { json } from './data';
import { safeAppPath } from './safe-path';
import { closeTopOverlay } from './overlay-stack';

/**
 * Bu cihazda anlık bildirim: her yerde Firebase Cloud Messaging. Tarayıcıda FCM jetonu portalın service worker'ı
 * (sw.js) ile alınır; Android/iOS uygulamasında Capacitor push eklentisi. Jeton sunucuya /notifications/devices ile kaydedilir.
 */
export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const isNative = () => Capacitor.isNativePlatform();
const NATIVE_KEY = 'ozg-fcm-token';
const WEB_KEY = 'ozg-fcm-web-token';

interface FirebaseWebConfig { apiKey: string; projectId: string; messagingSenderId: string; appId: string; vapidKey: string }

/** Service worker'ı kaydeder (bildirim göstermek için; önbellekleme yapmaz, geliştirmede de güvenle kaydedilir). */
export async function registerServiceWorker() {
  if (isNative() || !('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) {
    console.warn('Service worker kaydedilemedi', e);
    return null;
  }
}

async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('./')) ?? (await registerServiceWorker());
}

async function webConfig() {
  return (await api<{ web: FirebaseWebConfig | null }>('/notifications/push-config')).web;
}

/** Firebase Messaging yalnızca bildirim açılırken yüklenir (ilk açılışı ağırlaştırmasın). */
async function messaging(cfg: FirebaseWebConfig) {
  const [{ initializeApp, getApps }, m] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
  if (!(await m.isSupported())) return null;
  const { vapidKey, ...appConfig } = cfg;
  const app = getApps()[0] ?? initializeApp(appConfig);
  return { m, msg: m.getMessaging(app), vapidKey };
}

// Yerel push için uygulamada Firebase yapılandırması (google-services.json) gerekir; yokken register() uygulamayı çökertir.
const nativePushReady = () => import.meta.env.VITE_NATIVE_PUSH === '1';

export async function pushState(): Promise<PushState> {
  if (isNative()) {
    if (!nativePushReady()) return 'unconfigured';
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const p = await PushNotifications.checkPermissions();
    if (p.receive === 'denied') return 'denied';
    return storeGet(NATIVE_KEY) ? 'on' : 'off';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  if (!(await webConfig())) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && storeGet(WEB_KEY) ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (isNative()) return nativePushReady() ? enableNative() : 'unconfigured';
  const cfg = await webConfig();
  if (!cfg) return 'unconfigured';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await swRegistration();
  const fb = await messaging(cfg);
  if (!reg || !fb) return 'unsupported';
  const token = await fb.m.getToken(fb.msg, { vapidKey: fb.vapidKey, serviceWorkerRegistration: reg });
  await api('/notifications/devices', json('POST', { platform: 'web', token }));
  storeSet(WEB_KEY, token);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (isNative()) {
    const token = storeGet(NATIVE_KEY);
    if (token) await api('/notifications/devices', json('DELETE', { token })).catch(() => undefined);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister().catch(() => undefined);
    storeSet(NATIVE_KEY, null);
    return 'off';
  }
  const token = storeGet(WEB_KEY);
  if (token) await api('/notifications/devices', json('DELETE', { token })).catch(() => undefined);
  const cfg = await webConfig().catch(() => null);
  const fb = cfg ? await messaging(cfg).catch(() => null) : null;
  if (fb) await fb.m.deleteToken(fb.msg).catch(() => undefined);
  storeSet(WEB_KEY, null);
  return 'off';
}

async function enableNative(): Promise<PushState> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let p = await PushNotifications.checkPermissions();
  if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') return 'denied';
  const handles: { remove(): Promise<void> }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const token = await new Promise<string>((resolve, reject) => {
    // Cevap gelmezse "Aç" düğmesi sonsuza dek beklemesin.
    timer = setTimeout(() => reject(new Error('Bildirim kaydı zaman aşımına uğradı')), 15000);
    void PushNotifications.addListener('registration', (t) => resolve(t.value)).then((h) => handles.push(h));
    void PushNotifications.addListener('registrationError', (e) => reject(new Error(e.error))).then((h) => handles.push(h));
    PushNotifications.register().catch(reject);
  }).finally(() => {
    clearTimeout(timer);
    for (const h of handles) void h.remove();
  });
  await api('/notifications/devices', json('POST', { platform: Capacitor.getPlatform(), token }));
  storeSet(NATIVE_KEY, token);
  return 'on';
}

/**
 * Mobil uygulama açılışında bir kez çağrılır (Shell içinde, navigate ile):
 * bildirime dokununca ilgili sayfa açılır, Android geri tuşu önce geçmişte geri gider, kökte uygulamadan çıkar.
 */
export async function initNativeApp(navigate: (path: string) => void, isDisposed: () => boolean = () => false): Promise<() => void> {
  if (!isNative()) return () => undefined;
  const [{ PushNotifications }, { App }] = await Promise.all([import('@capacitor/push-notifications'), import('@capacitor/app')]);
  const { syncDeviceCalendar } = await import('./device-calendar');
  // Çıkış-giriş sonrası (Shell yeniden kurulunca) dinleyiciler üst üste binmesin: kurulan her dinleyici geri sökülür.
  const handles: { remove(): Promise<void> }[] = [];
  const dispose = () => { for (const h of handles.splice(0)) void h.remove(); };
  if (isDisposed()) return dispose;
  handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const link = a.notification.data?.link;
    const to = safeAppPath(link);
    if (to) navigate(to);
  }));
  handles.push(await App.addListener('backButton', ({ canGoBack }) => {
    // Açık pencere (önizleme, çekmece, form) varsa geri tuşu önce onu kapatır, sayfa değişmez.
    if (closeTopOverlay()) return;
    if (canGoBack && window.location.hash.replace(/^#/, '') !== '/') window.history.back();
    else void App.exitApp();
  }));
  // Cihaz takvimi açıksa açılışta ve uygulamaya her dönüşte eşitle (bkz. lib/device-calendar.ts)
  const sync = () => void syncDeviceCalendar().catch(() => undefined);
  handles.push(await App.addListener('resume', sync));
  // Kurulum sürerken bileşen kaldırıldıysa hemen sök.
  if (isDisposed()) { dispose(); return dispose; }
  sync();

  await askNotificationPermission();
  return dispose;
}

/** Uygulama açılır açılmaz (giriş ekranından önce) bildirim iznini sorar; daha önce sorulduysa sistem tekrar sormaz. */
let permissionAsk: Promise<string | null> | null = null;
export function requestNotificationPermission() {
  permissionAsk ??= askOnce(); // açılış ve giriş sonrası çağrılar aynı pencereyi bekler, iki kez sorulmaz
  return permissionAsk;
}
async function askOnce(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let p = await PushNotifications.checkPermissions();
    if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PushNotifications.requestPermissions();
    return p.receive;
  } catch (e) {
    console.warn('Bildirim izni alınamadı', e);
    return null;
  }
}

/** Girişten sonra: izin verilmişse ve Firebase yapılandırılmışsa cihaz bildirimler için kaydedilir. */
async function askNotificationPermission() {
  const granted = (await requestNotificationPermission()) === 'granted';
  if (granted && nativePushReady() && !storeGet(NATIVE_KEY)) await enableNative().catch((e) => console.warn('Cihaz kaydedilemedi', e));
}
