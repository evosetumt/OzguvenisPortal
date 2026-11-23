import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { startCertificateHelper } from './cert-helper';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

/**
 * Üretim (iç ağ) modu: NODE_ENV=production ve HTTPS_PFX_FILE tanımlıysa API, HTTPS ile (HTTPS_PORT, varsayılan 443) hem /api'yi
 * hem derlenmiş arayüzü (WEB_DIST_DIR) tek süreçte sunar; 80 portunda kök sertifika yükleme sayfası açılır.
 * Tanımlı değilse geliştirme modu: yalnızca API, PORT (3000); arayüzü Vite sunar.
 */
async function bootstrap() {
  // Geliştirmede (.env aynı olsa da) Vite'ın 3000 portundaki API'ye ihtiyacı var: HTTPS modu yalnızca üretimde.
  const pfxFile = process.env.NODE_ENV === 'production' ? process.env.HTTPS_PFX_FILE : undefined;
  const https = pfxFile ? { pfx: readFileSync(pfxFile), passphrase: process.env.HTTPS_PFX_PASSPHRASE ?? '' } : undefined;

  // rawBody: WhatsApp webhook imzası (X-Hub-Signature-256) ham gövde üzerinden doğrulanır.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, httpsOptions: https });
  app.setGlobalPrefix('api');
  // Kapanışta (SIGTERM/SIGINT) Prisma/mssql bağlantıları kapansın, zamanlayıcılar temizlensin.
  app.enableShutdownHooks();
  // BPMN diyagramı XML'i JSON gövdesinde gelir; varsayılan 100 KB sınırı yetmeyebilir.
  app.useBodyParser('json', { limit: '5mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Benzersizlik/ilişki/bulunamadı Prisma hataları 500 yerine 409/400/404 dönsün.
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean), credentials: true });
  // Temel güvenlik başlıkları (HSTS'i Cloudflare/HTTPS katmanı verir). iframe yalnız aynı kökenden (e-belge önizlemesi).
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  // Kurulum programıyla (Windows servisi, Cloudflare Tunnel arkasında) çalışırken HTTP'dir; arayüzü de bu süreç sunar.
  const serveWeb = !!https || (process.env.NODE_ENV === 'production' && !!process.env.WEB_DIST_DIR);
  if (serveWeb) {
    const web = resolve(process.env.WEB_DIST_DIR ?? resolve(process.cwd(), '../web/dist'));
    if (!existsSync(resolve(web, 'index.html'))) throw new Error(`Derlenmiş arayüz bulunamadı: ${web} (npm run build)`);
    // index.html ve service worker her açılışta tazelensin; diğer dosyalar adında sürüm taşır.
    app.useStaticAssets(web, {
      setHeaders: (res, path) => {
        if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
      },
    });
  }

  if (https) {
    const port = Number(process.env.HTTPS_PORT ?? 443);
    await app.listen(port, '0.0.0.0');
    console.log(`Portal yayında: https://<bu-bilgisayar>${port === 443 ? '' : `:${port}`}`);
    const caFile = process.env.HTTPS_CA_CERT_FILE;
    if (caFile) startCertificateHelper(Number(process.env.HTTP_HELPER_PORT ?? 80), caFile, port);
    return;
  }

  const port = Number(process.env.PORT ?? 3000);
  // Tunnel arkasında HOST=127.0.0.1: portala yalnız cloudflared üzerinden erişilir (ağdan doğrudan açılmaz).
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`${serveWeb ? 'Portal' : 'API'} dinleniyor: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${serveWeb ? '' : '/api'}`);
}
bootstrap();
