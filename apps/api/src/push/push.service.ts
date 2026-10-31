import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ChannelSender, NewNotification } from '../notifications/notifications.service';
import { FcmClient, FcmTokenGoneError } from './fcm.client';

/** Tarayıcının Firebase'e bağlanması için gereken herkese açık web yapılandırması (gizli değildir). */
export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

/**
 * "push" kanalı: tüm cihazlara (tarayıcı, Android, iOS) Firebase Cloud Messaging.
 * Kullanıcının tüm cihazlarına gider; geçersiz jetonlar silinir.
 */
@Injectable()
export class PushService implements ChannelSender {
  private readonly fcm = new FcmClient();

  constructor(private readonly prisma: PrismaService) {}

  isConfigured() {
    return this.fcm.configured;
  }

  /** Web yapılandırması eksiksizse döner; yoksa tarayıcıda bildirim açılamaz. */
  get webConfig(): FirebaseWebConfig | null {
    const c = {
      apiKey: process.env.FCM_WEB_API_KEY ?? '',
      projectId: process.env.FCM_PROJECT_ID ?? '',
      messagingSenderId: process.env.FCM_WEB_MESSAGING_SENDER_ID ?? '',
      appId: process.env.FCM_WEB_APP_ID ?? '',
      vapidKey: process.env.FCM_WEB_VAPID_KEY ?? '',
    };
    return Object.values(c).every(Boolean) ? c : null;
  }

  async send(userId: number, n: NewNotification & { id?: number }) {
    if (!this.fcm.configured) throw new Error('Firebase yapılandırılmamış (FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT_FILE)');
    const targets = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (!targets.length) throw new Error('Kullanıcının kayıtlı cihazı yok');

    const errors: string[] = [];
    await Promise.all(targets.map(async (d) => {
      try {
        // Eski Web Push (VAPID) aboneliği JSON metniydi; FCM'de geçersizdir, silinir.
        if (d.token.startsWith('{')) throw new FcmTokenGoneError('Eski Web Push aboneliği');
        // Kapatma sinyali yalnızca tarayıcılara (service worker bildirimi kapatır); mobilde işletim sistemi kendisi kapatır.
        if (n.delivery?.close && d.platform !== 'web') return;
        await this.fcm.send(d.token, d.platform, {
          ...n.delivery, title: n.title, body: n.body ?? '', link: n.link ?? '/', tag: n.delivery?.tag ?? (n.id ? `n${n.id}` : n.type),
        });
      } catch (e: any) {
        if (e instanceof FcmTokenGoneError) await this.prisma.deviceToken.delete({ where: { id: d.id } }).catch(() => undefined);
        else errors.push(String(e?.message ?? e));
      }
    }));
    if (errors.length === targets.length && errors.length) throw new Error(errors[0]);
  }
}
