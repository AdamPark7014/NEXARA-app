import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';

export type PushPayload = {
  title: string;
  body: string;
  relatedUrl?: string | null;
};

@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);
  private firebaseInited = false;
  private webPushInited = false;
  private webPushTried = false;

  constructor(private readonly prisma: PrismaService) {}

  private tryInitFirebase(): boolean {
    if (this.firebaseInited) return true;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) return false;
    try {
      if (!admin.apps.length) {
        const cred = JSON.parse(raw) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(cred) });
      }
      this.firebaseInited = true;
      return true;
    } catch (e) {
      this.logger.warn(`FCM no disponible: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  private tryInitWebPush(): boolean {
    if (this.webPushTried) return this.webPushInited;
    this.webPushTried = true;
    const pub = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const priv = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    if (!pub || !priv) return false;
    try {
      webpush.setVapidDetails(process.env.WEB_PUSH_CONTACT || 'mailto:soporte@nexara.com.mx', pub, priv);
      this.webPushInited = true;
      return true;
    } catch (e) {
      this.logger.warn(`Web Push VAPID no disponible: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  async sendToUser(userId: number, payload: PushPayload): Promise<void> {
    const rows = await this.prisma.userPushEndpoint.findMany({ where: { userId } });

    const data: Record<string, string> = {
      title: payload.title,
      body: payload.body,
      url: payload.relatedUrl || '',
    };

    const fcmOk = this.tryInitFirebase();
    const webOk = this.tryInitWebPush();

    for (const row of rows) {
      if (row.fcmToken && fcmOk) {
        try {
          await admin.messaging().send({
            token: row.fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: {
              title: payload.title,
              body: payload.body,
              url: data.url,
            },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default' } } },
          });
        } catch (e) {
          this.logger.warn(
            `FCM fallo token …${row.fcmToken.length > 8 ? row.fcmToken.slice(-8) : row.fcmToken}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }

      if (row.webPushEndpoint && row.webPushKeys && webOk) {
        try {
          const keys = row.webPushKeys as { p256dh?: string; auth?: string };
          if (!keys?.p256dh || !keys?.auth) continue;
          const sub = {
            endpoint: row.webPushEndpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          };
          await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(data));
        } catch (e) {
          this.logger.warn(`Web push fallo: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }
}
