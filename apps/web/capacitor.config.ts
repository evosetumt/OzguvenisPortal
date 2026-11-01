import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android/iOS paketi. Uygulama dist klasörünü cihaza gömer; API'ye VITE_API_URL ile (bkz. .env.mobile) tam adresten bağlanır.
 * API tarafında CORS_ORIGIN'e mobil kökenler eklenmeli: https://localhost (Android), capacitor://localhost (iOS).
 */
const config: CapacitorConfig = {
  appId: 'portal.ozguvenis.com.tr',
  appName: 'Özgüveniş',
  webDir: 'dist',
  android: { allowMixedContent: false },
  server: {
    androidScheme: 'https',
    // Geliştirmede canlı yenileme için: CAP_SERVER_URL=http://<pc-ip>:5173 npx cap run android
    ...(process.env.CAP_SERVER_URL ? { url: process.env.CAP_SERVER_URL, cleartext: true } : {}),
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
