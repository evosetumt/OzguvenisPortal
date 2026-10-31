import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// İç ağ denemesi için kendi imzalı sertifika (apps/web/.cert/dev.pfx varsa geliştirme sunucusu HTTPS açılır).
// Kamera/mikrofon (WebRTC arama) ve bildirimler yalnızca güvenli bağlantıda çalışır; kalıcı kurulumda HTTPS'i Caddy sağlar.
const pfx = new URL('./.cert/dev.pfx', import.meta.url);
// DEV_HTTP=1: sertifikasız (localhost/127.0.0.1 tarayıcıda yine güvenli sayılır; otomasyon testleri için).
const https = existsSync(pfx) && !process.env.DEV_HTTP ? { pfx: readFileSync(pfx), passphrase: 'ozguvenis-dev' } : undefined;

export default defineConfig({
  plugins: [react()],
  base: './', // IIS alt klasörü ve Capacitor için göreli yollar
  server: {
    port: 5173,
    https,
    proxy: {
      // ws: true → sohbet/bildirim WebSocket'i (/api/socket.io) da API'ye iletilir
      // API_PROXY: üretim modunda çalışan API'ye bağlanmak için (ör. https://localhost; kendi imzalı sertifika kabul edilir)
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:3000', ws: true, secure: false },
    },
  },
});
