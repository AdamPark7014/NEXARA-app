import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';

export type PushPayload = {
  title: string;
  body: string;
  relatedUrl?: string | null;
  /** Alta prioridad: FCM high, Web Push JSON, cliente puede usar requireInteraction en SW. */
  priority?: 'high' | 'normal' | 'low';
  /** Tag estable para reemplazar notificaciones en bandeja (p. ej. nexara-123). */
  tag?: string;
  /** ID de fila Notification para dedupe / trazabilidad en cliente. */
  notificationId?: number;
  /** Canal de routing Android (ops/tickets/alerts/…). */
  channel?: string;
  /** Tipo/evento de dominio (ACTIVITY_STARTED, …). */
  event?: string;
  /** Collapse key FCM — una acción/entidad = una tarjeta en bandeja. */
  collapseKey?: string;
  entityType?: string | null;
  relatedEntityId?: number | null;
  category?: string | null;
  /** chat = mensaje de conversación (se apila por hilo); event = aviso de actividad, asistencia, etc. */
  kind?: 'chat' | 'event';
  /** Quién lo provocó: nombre y foto para el aviso del teléfono. */
  senderId?: number | null;
  senderName?: string | null;
  senderAvatar?: string | null;
  /** Conversación o entidad que agrupa los avisos (id de canal de chat, actividad…). */
  threadId?: string | null;
  /** Nombre del grupo en chats grupales; vacío en mensajes directos. */
  threadTitle?: string | null;
  messageId?: number | null;
};

/** Errores de FCM que significan que el token ya no sirve (app desinstalada o reinstalada). */
const DEAD_FCM_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

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
        // JSON tal cual o en base64 (así lo instala scripts/firebase/instalar-clave-servidor.ps1,
        // sin comillas ni saltos de línea que el .env pueda romper).
        const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        const cred = JSON.parse(json) as admin.ServiceAccount;
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

  /**
   * Datos del aviso tal como los recibe el teléfono (FCM `data`). También viajan por el socket
   * (`push:show`) para que la app los muestre aunque FCM no esté configurado o tarde.
   */
  buildPushData(userId: number, payload: PushPayload): Record<string, string> {
    return this.buildData(userId, payload).data;
  }

  private buildData(userId: number, payload: PushPayload) {
    const priority = payload.priority || 'normal';
    const collapseKey =
      payload.collapseKey ||
      payload.tag ||
      (payload.notificationId ? `nexara-${payload.notificationId}` : `nexara-${userId}-${Date.now()}`);
    const tag = payload.tag || collapseKey;
    const nid = payload.notificationId != null ? String(payload.notificationId) : '';
    const channel = payload.channel || 'default';
    const event = payload.event || '';

    const kind = payload.kind || 'event';
    const threadId = payload.threadId || tag;
    const data: Record<string, string> = {
      title: payload.title,
      body: payload.body,
      url: payload.relatedUrl || '',
      priority,
      tag,
      channel,
      event,
      collapse_key: collapseKey,
      nexara_notification_id: nid,
      entityType: payload.entityType || '',
      relatedEntityId: payload.relatedEntityId != null ? String(payload.relatedEntityId) : '',
      category: payload.category || '',
      kind,
      sender_id: payload.senderId != null ? String(payload.senderId) : '',
      sender_name: payload.senderName || '',
      sender_avatar: payload.senderAvatar || '',
      thread_id: threadId,
      thread_title: payload.threadTitle || '',
      message_id: payload.messageId != null ? String(payload.messageId) : '',
      sent_at: new Date().toISOString(),
    };
    return { data, priority, collapseKey, kind, threadId };
  }

  async sendToUser(userId: number, payload: PushPayload): Promise<void> {
    const rows = await this.prisma.userPushEndpoint.findMany({ where: { userId } });
    const { data, collapseKey, kind, threadId } = this.buildData(userId, payload);

    const fcmOk = this.tryInitFirebase();
    const webOk = this.tryInitWebPush();

    for (const row of rows) {
      if (row.fcmToken && fcmOk) {
        try {
          // Android: solo `data` y prioridad alta. Así el servicio de la app SIEMPRE recibe el
          // mensaje (primer plano, fondo o app cerrada) y lo dibuja como aviso emergente con su
          // canal, remitente y conversación; con un bloque `notification` Android lo pinta solo
          // en segundo plano, en un canal sin sonido emergente. iOS lee el `alert` de `apns`.
          await admin.messaging().send({
            token: row.fcmToken,
            data,
            android: {
              priority: 'high',
              // En chat cada mensaje cuenta: sin collapseKey FCM no descarta los pendientes.
              ...(kind === 'chat' ? {} : { collapseKey }),
            },
            apns: {
              headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
              payload: {
                aps: {
                  alert: { title: payload.title, body: payload.body },
                  sound: 'default',
                  threadId,
                },
              },
            },
          });
        } catch (e) {
          const code = (e as { code?: string } | null)?.code || '';
          const tokenTail = row.fcmToken.length > 8 ? row.fcmToken.slice(-8) : row.fcmToken;
          if (DEAD_FCM_TOKEN_CODES.has(code)) {
            // Token de una app desinstalada o reinstalada: se borra para no reintentar para siempre.
            await (row.webPushEndpoint
              ? this.prisma.userPushEndpoint.update({ where: { id: row.id }, data: { fcmToken: null } })
              : this.prisma.userPushEndpoint.delete({ where: { id: row.id } })
            ).catch(() => undefined);
            this.logger.log(`FCM token …${tokenTail} ya no existe (${code}); eliminado`);
          } else {
            this.logger.warn(`FCM fallo token …${tokenTail}: ${e instanceof Error ? e.message : e}`);
          }
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
