import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assertPublicHttpUrl, assertResolvesPublic } from './url-guard.js';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { JobQueueService } from '../jobs/job-queue.service.js';

export const WEBHOOK_EVENTS = [
  'invoice.paid',
  'invoice.overdue',
  'stock.low',
  'stock.dead',
  'ticket.sla_breach',
  'user.locked',
  'user.inactive',
  'opportunity.won',
  'opportunity.lost',
  'payment.registered',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | string;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
  ) {}

  listCatalog() {
    return { events: WEBHOOK_EVENTS };
  }

  async list(companyId?: number | null) {
    return this.prisma.outboundWebhook.findMany({
      where: { ...companyWhere(companyId ?? null) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { deliveries: true } } },
    });
  }

  async create(
    dto: { name: string; url: string; events: string[]; secret?: string },
    userId?: number,
    companyId?: number | null,
  ) {
    this.assertUrl(dto.url);
    const events = (dto.events || []).filter(Boolean);
    if (!events.length) throw new BadRequestException('Selecciona al menos un evento');
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    return this.prisma.outboundWebhook.create({
      data: {
        name: dto.name.trim(),
        url: dto.url.trim(),
        events,
        secret: dto.secret?.trim() || randomBytes(24).toString('hex'),
        createdById: userId ?? null,
        companyId: resolvedCompanyId,
      },
    });
  }

  async update(
    id: number,
    dto: Partial<{ name: string; url: string; events: string[]; isActive: boolean; secret: string }>,
    companyId?: number | null,
  ) {
    const existing = await this.prisma.outboundWebhook.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Webhook');
    if (dto.url) this.assertUrl(dto.url);
    return this.prisma.outboundWebhook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.secret !== undefined ? { secret: dto.secret.trim() || null } : {}),
      },
    });
  }

  async remove(id: number, companyId?: number | null) {
    const existing = await this.prisma.outboundWebhook.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Webhook');
    await this.prisma.outboundWebhook.delete({ where: { id } });
    return { ok: true };
  }

  async listDeliveries(webhookId: number, limit = 50, companyId?: number | null) {
    const hook = await this.prisma.outboundWebhook.findFirst({
      where: { id: webhookId, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(hook, companyId, 'Webhook');
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /** Dead-letter queue: entregas fallidas del tenant. */
  async listDlq(companyId?: number | null, limit = 50) {
    const cid = companyId != null && Number.isFinite(Number(companyId)) ? Number(companyId) : null;
    return this.prisma.webhookDelivery.findMany({
      where: {
        status: 'failed',
        webhook: { ...companyWhere(cid) },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        webhook: { select: { id: true, name: true, url: true, companyId: true } },
      },
    });
  }

  async replayDelivery(deliveryId: number, companyId?: number | null) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery) throw new NotFoundException('Delivery no encontrada');
    assertCompanyAccess(delivery.webhook, companyId, 'Webhook');
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'pending',
        nextRetryAt: new Date(),
        responseCode: null,
        responseBody: null,
      },
    });
    await this.deliver(deliveryId);
    return this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  }

  /**
   * Emite solo a webhooks del tenant.
   * Sin companyId no se hace broadcast global (evita leak cross-tenant).
   */
  async emit(event: WebhookEvent, payload: Record<string, unknown>, companyId?: number | null) {
    const cid =
      companyId != null && Number.isFinite(Number(companyId))
        ? Number(companyId)
        : typeof payload.companyId === 'number'
          ? payload.companyId
          : null;
    if (cid == null) {
      this.logger.debug(`Webhook emit skipped (no companyId): ${event}`);
      return { queued: 0 };
    }

    const hooks = await this.prisma.outboundWebhook.findMany({
      where: { isActive: true, companyId: cid, events: { has: event } },
    });
    if (!hooks.length) return { queued: 0 };

    let queued = 0;
    for (const hook of hooks) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event,
          payload: JSON.parse(
            JSON.stringify({
              event,
              occurredAt: new Date().toISOString(),
              companyId: cid,
              data: payload,
            }),
          ) as Prisma.InputJsonValue,
          status: 'pending',
          nextRetryAt: new Date(),
        },
      });
      // Persist delivery then enqueue durable retry path (in-process / BullMQ-ready).
      void this.jobs
        .enqueue(
          'webhook.deliver',
          {
            url: hook.url,
            body: delivery.payload,
            headers: hook.secret
              ? {
                  'X-Nexara-Event': event,
                  'X-Nexara-Delivery': String(delivery.id),
                  'X-Nexara-Signature': `sha256=${createHmac('sha256', hook.secret)
                    .update(JSON.stringify(delivery.payload))
                    .digest('hex')}`,
                }
              : {
                  'X-Nexara-Event': event,
                  'X-Nexara-Delivery': String(delivery.id),
                },
            deliveryId: delivery.id,
          },
          { maxAttempts: 5 },
        )
        .catch(() => undefined);
      void this.deliver(delivery.id).catch((err) =>
        this.logger.warn(`Webhook delivery ${delivery.id} falló: ${(err as Error).message}`),
      );
      queued += 1;
    }
    return { queued };
  }

  async deliver(deliveryId: number) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery || !delivery.webhook.isActive) return;

    const attempts = delivery.attempts + 1;
    const body = JSON.stringify(delivery.payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'NEXARA-Webhooks/1.0',
      'X-Nexara-Event': delivery.event,
      'X-Nexara-Delivery': String(delivery.id),
    };
    if (delivery.webhook.secret) {
      const sig = createHmac('sha256', delivery.webhook.secret).update(body).digest('hex');
      headers['X-Nexara-Signature'] = `sha256=${sig}`;
    }

    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let ok = false;
    try {
      // Se revalida con el nombre ya resuelto: un dominio público registrado
      // hoy puede apuntar mañana a una dirección interna, y la validación de
      // guardado ya habría pasado.
      await assertResolvesPublic(delivery.webhook.url);
      const res = await fetch(delivery.webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(12_000),
      });
      responseCode = res.status;
      responseBody = (await res.text().catch(() => '')).slice(0, 1000);
      ok = res.status >= 200 && res.status < 300;
    } catch (err) {
      responseBody = String((err as Error).message || err).slice(0, 1000);
      ok = false;
    }

    if (ok) {
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'delivered',
            attempts,
            responseCode,
            responseBody,
            deliveredAt: new Date(),
            nextRetryAt: null,
          },
        }),
        this.prisma.outboundWebhook.update({
          where: { id: delivery.webhookId },
          data: {
            failureCount: 0,
            lastDeliveryAt: new Date(),
            lastStatusCode: responseCode,
          },
        }),
      ]);
      return;
    }

    const maxAttempts = 5;
    const backoffMin = Math.min(60, 2 ** attempts);
    const nextRetryAt =
      attempts >= maxAttempts ? null : new Date(Date.now() + backoffMin * 60_000);

    await this.prisma.$transaction([
      this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: attempts >= maxAttempts ? 'failed' : 'pending',
          attempts,
          responseCode,
          responseBody,
          nextRetryAt,
        },
      }),
      this.prisma.outboundWebhook.update({
        where: { id: delivery.webhookId },
        data: {
          failureCount: { increment: 1 },
          lastDeliveryAt: new Date(),
          lastStatusCode: responseCode,
          ...(attempts >= maxAttempts ? { isActive: false } : {}),
        },
      }),
    ]);
  }

  async processRetries(limit = 25) {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const d of due) {
      await this.deliver(d.id);
    }
    return { processed: due.length };
  }

  async testPing(id: number, companyId?: number | null) {
    const hook = await this.prisma.outboundWebhook.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(hook, companyId, 'Webhook');
    return this.emit('webhook.test', { webhookId: id, message: 'NEXARA webhook ping' }, hook!.companyId);
  }

  verifySignature(secret: string, body: string, header: string | undefined): boolean {
    if (!header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const got = header.slice('sha256='.length);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
    } catch {
      return false;
    }
  }

  /**
   * Antes sólo comprobaba el protocolo, así que un webhook podía apuntar a la
   * red interna y —como la respuesta se guarda y se muestra en el registro de
   * entregas— servir para leer de ella. Ver `url-guard.ts`.
   */
  private assertUrl(url: string) {
    assertPublicHttpUrl(url);
  }
}
