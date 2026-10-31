import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { startCertificateHelper } from './cert-helper';

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
  // BPMN diyagramı XML'i JSON gövdesinde gelir; varsayılan 100 KB sınırı yetmeyebilir.
  app.useBodyParser('json', { limit: '5mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean), credentials: true });

  if (https) {
    const web = resolve(process.env.WEB_DIST_DIR ?? resolve(process.cwd(), '../web/dist'));
    if (!existsSync(resolve(web, 'index.html'))) throw new Error(`Derlenmiş arayüz bulunamadı: ${web} (npm run build)`);
    // index.html ve service worker her açılışta tazelensin; diğer dosyalar adında sürüm taşır.
    app.useStaticAssets(web, {
      setHeaders: (res, path) => {
        if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
      },
    });
    const port = Number(process.env.HTTPS_PORT ?? 443);
    await app.listen(port, '0.0.0.0');
    console.log(`Portal yayında: https://<bu-bilgisayar>${port === 443 ? '' : `:${port}`}`);
    const caFile = process.env.HTTPS_CA_CERT_FILE;
    if (caFile) startCertificateHelper(Number(process.env.HTTP_HELPER_PORT ?? 80), caFile, port);
    return;
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API dinleniyor: http://localhost:${port}/api`);
}
bootstrap();
