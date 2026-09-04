import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import {
  alarmFingerprint,
  alarmTitle,
  classifyPushForAlarm,
  parseAlarmPolicy,
  parseSocId,
  socExternalId,
  type AlarmPolicy,
  type SocAlarmKind,
} from './integra-acs-alarms.policy';

export type SocQueueItem = {
  id: string;
  status: string;
  title: string;
  severity: string;
  timestamp: string;
  srcName: string;
  cameraIndexCode: string | null;
  doorIndexCode: string | null;
  eventType: string;
  note: string | null;
  ackedAt: string | null;
  clearedAt: string | null;
  source: 'push';
  kind: SocAlarmKind;
  personId: string | null;
  personName: string | null;
  photoPath: string | null;
  doorNo: number | null;
  doorName: string | null;
  deviceIp: string | null;
  deviceName: string | null;
  occurrenceCount: number;
  ticketRequestId: number | null;
  pushEventId: number | null;
};

@Injectable()
export class IntegraAcsAlarmsService {
  private readonly logger = new Logger(IntegraAcsAlarmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceClients: ServiceClientsService,
  ) {}

  /**
   * Tras persistir un evento push ACS: abre/actualiza alarma SOC y escala a ticket
   * si el patrón se repite (umbral configurable en IntegraSite.alarmPolicy).
   */
  async onPushEvent(input: {
    companyId: number;
    siteId: number;
    pushEventId: number;
    major: number | null;
    minor: number | null;
    occurredAt: Date;
    personId?: string | null;
    personName?: string | null;
    doorNo?: number | null;
    deviceIp?: string | null;
    deviceName?: string | null;
    photoPath?: string | null;
  }): Promise<{ alarmId: number; escalated: boolean } | null> {
    const site = await this.prisma.integraSite.findUnique({
      where: { id: input.siteId },
      select: { id: true, companyId: true, alarmPolicy: true, serviceClientId: true, label: true, name: true },
    });
    if (!site || site.companyId !== input.companyId) return null;

    const policy = parseAlarmPolicy(site.alarmPolicy);
    const kind = classifyPushForAlarm({
      major: input.major,
      minor: input.minor,
      occurredAt: input.occurredAt,
      policy,
    });
    if (!kind) return null;

    const doorName = await this.resolveDoorName(input.siteId, input.doorNo, input.deviceIp, input.deviceName);
    const fingerprint = alarmFingerprint({
      kind,
      personId: input.personId,
      doorNo: input.doorNo,
      deviceIp: input.deviceIp,
    });
    const title = alarmTitle(kind, input.personName);
    const severity = kind === 'DENIED' ? 'alta' : 'media';
    const windowStart = new Date(input.occurredAt.getTime() - policy.windowMinutes * 60_000);

    const existing = await this.prisma.integraSocAlarm.findFirst({
      where: {
        siteId: input.siteId,
        fingerprint,
        status: { in: ['OPEN', 'ACK', 'TICKETED'] },
        lastOccurredAt: { gte: windowStart },
      },
      orderBy: { lastOccurredAt: 'desc' },
    });

    let row;
    if (existing) {
      row = await this.prisma.integraSocAlarm.update({
        where: { id: existing.id },
        data: {
          status: existing.status === 'CLEARED' ? 'OPEN' : existing.status === 'ACK' ? 'OPEN' : existing.status,
          title,
          severity,
          personId: input.personId ?? existing.personId,
          personName: input.personName ?? existing.personName,
          doorNo: input.doorNo ?? existing.doorNo,
          doorName: doorName ?? existing.doorName,
          deviceIp: input.deviceIp ?? existing.deviceIp,
          deviceName: input.deviceName ?? existing.deviceName,
          photoPath: input.photoPath || existing.photoPath,
          pushEventId: input.pushEventId,
          occurrenceCount: existing.occurrenceCount + 1,
          lastOccurredAt: input.occurredAt,
        },
      });
    } else {
      row = await this.prisma.integraSocAlarm.create({
        data: {
          companyId: input.companyId,
          siteId: input.siteId,
          kind,
          status: 'OPEN',
          fingerprint,
          title,
          severity,
          personId: input.personId ?? null,
          personName: input.personName ?? null,
          doorNo: input.doorNo ?? null,
          doorName,
          deviceIp: input.deviceIp ?? null,
          deviceName: input.deviceName ?? null,
          photoPath: input.photoPath ?? null,
          pushEventId: input.pushEventId,
          occurrenceCount: 1,
          firstOccurredAt: input.occurredAt,
          lastOccurredAt: input.occurredAt,
        },
      });
    }

    let escalated = false;
    if (
      !row.ticketRequestId &&
      row.occurrenceCount >= policy.denialThreshold &&
      site.serviceClientId
    ) {
      try {
        const ticket = await this.escalateToTicket(site, row, policy);
        if (ticket) {
          row = await this.prisma.integraSocAlarm.update({
            where: { id: row.id },
            data: {
              ticketRequestId: ticket.id,
              escalatedAt: new Date(),
              status: 'TICKETED',
            },
          });
          escalated = true;
        }
      } catch (e) {
        this.logger.warn(
          `Escalado ticket SOC ${row.id} falló: ${(e as Error).message}`,
        );
      }
    }

    return { alarmId: row.id, escalated };
  }

  async listQueue(
    companyId: number,
    siteId: number,
    opts?: { hours?: number },
  ): Promise<{ items: SocQueueItem[]; openCount: number }> {
    const hours = Math.min(Math.max(opts?.hours ?? 24, 1), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await this.prisma.integraSocAlarm.findMany({
      where: {
        companyId,
        siteId,
        lastOccurredAt: { gte: since },
        status: { not: 'CLEARED' },
      },
      orderBy: { lastOccurredAt: 'desc' },
      take: 100,
    });
    const items = rows.map((r) => this.toQueueItem(r));
    const openCount = items.filter((i) => i.status === 'OPEN' || i.status === 'TICKETED').length;
    return { items, openCount };
  }

  async setStatus(
    companyId: number,
    externalId: string,
    opts: { status: 'ACK' | 'CLEARED'; note?: string; userId?: number | null },
  ) {
    const id = parseSocId(externalId);
    if (!id) return null;
    const row = await this.prisma.integraSocAlarm.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new BadRequestException('Alarma SOC no encontrada');
    const updated = await this.prisma.integraSocAlarm.update({
      where: { id },
      data: {
        status: opts.status,
        note: (opts.note || '').trim() || row.note,
        userId: opts.userId ?? row.userId,
      },
    });
    return {
      id: socExternalId(updated.id),
      status: updated.status,
      note: updated.note,
      ackedAt: new Date().toISOString(),
      clearedAt: opts.status === 'CLEARED' ? new Date().toISOString() : null,
    };
  }

  async createTicketFromAlarm(
    companyId: number,
    externalId: string,
    siteId: number | null,
    body?: { title?: string; description?: string; severity?: string },
  ) {
    const id = parseSocId(externalId);
    if (!id) return null;
    const row = await this.prisma.integraSocAlarm.findFirst({
      where: { id, companyId, ...(siteId ? { siteId } : {}) },
    });
    if (!row) throw new BadRequestException('Alarma SOC no encontrada');
    const site = await this.prisma.integraSite.findUnique({
      where: { id: row.siteId },
      select: {
        id: true,
        serviceClientId: true,
        label: true,
        name: true,
        alarmPolicy: true,
        companyId: true,
      },
    });
    if (!site?.serviceClientId) {
      throw new BadRequestException(
        'El sitio no tiene cliente operativo vinculado. Configúralo en Integra → Sitios.',
      );
    }
    if (row.ticketRequestId) {
      return { ok: true, ticketId: row.ticketRequestId, already: true, siteId: site.id };
    }
    const policy = parseAlarmPolicy(site.alarmPolicy);
    const ticket = await this.escalateToTicket(site, row, policy, body);
    await this.prisma.integraSocAlarm.update({
      where: { id: row.id },
      data: {
        ticketRequestId: ticket.id,
        escalatedAt: new Date(),
        status: 'TICKETED',
        title: body?.title?.trim() || row.title,
      },
    });
    return { ok: true, ticket, clientId: site.serviceClientId, siteId: site.id };
  }

  private async escalateToTicket(
    site: {
      id: number;
      serviceClientId: number | null;
      label: string | null;
      name: string;
      companyId: number;
    },
    row: {
      id: number;
      kind: string;
      title: string;
      severity: string;
      personName: string | null;
      personId: string | null;
      doorName: string | null;
      doorNo: number | null;
      deviceName: string | null;
      deviceIp: string | null;
      occurrenceCount: number;
      lastOccurredAt: Date;
      photoPath: string | null;
    },
    policy: AlarmPolicy,
    body?: { title?: string; description?: string; severity?: string },
  ) {
    if (!site.serviceClientId) {
      throw new BadRequestException(
        'El sitio no tiene cliente operativo vinculado. Configúralo en Integra → Sitios.',
      );
    }
    const door =
      row.doorName ||
      (row.doorNo != null ? `Puerta ${row.doorNo}` : null) ||
      row.deviceName ||
      row.deviceIp ||
      '—';
    const description = [
      body?.title || row.title,
      body?.description,
      `Tipo: ${row.kind === 'AFTER_HOURS' ? 'Entrada fuera de horario' : 'Acceso denegado'}`,
      `Persona: ${row.personName || row.personId || 'desconocida'}`,
      `Puerta: ${door}`,
      `Repeticiones: ${row.occurrenceCount} (umbral ${policy.denialThreshold} / ${policy.windowMinutes} min)`,
      `Último: ${row.lastOccurredAt.toISOString()}`,
      body?.severity || row.severity ? `Severidad: ${body?.severity || row.severity}` : null,
      row.photoPath ? `Foto: ${row.photoPath}` : null,
      `alarmId=${socExternalId(row.id)}`,
      `siteId=${site.id}`,
      `Sitio: ${site.label || site.name}`,
      'Fuente: evento push ACS (verificado).',
    ]
      .filter(Boolean)
      .join('\n');

    return this.serviceClients.createTicketRequest(
      site.serviceClientId,
      { description, urgency: 'HIGH', requestType: 'ISSUE' },
      site.companyId,
    );
  }

  private async resolveDoorName(
    siteId: number,
    doorNo?: number | null,
    deviceIp?: string | null,
    deviceName?: string | null,
  ): Promise<string | null> {
    if (deviceName?.trim()) return deviceName.trim().slice(0, 220);
    if (doorNo == null) return null;
    const doors = await this.prisma.integraDoor.findMany({
      where: { siteId },
      select: { name: true, doorIndexCode: true },
      take: 80,
    });
    const ip = (deviceIp || '').trim();
    const hit =
      doors.find((d) => ip && d.doorIndexCode.startsWith(`${ip}|`) && d.doorIndexCode.endsWith(`|${doorNo}`)) ||
      doors.find((d) => d.doorIndexCode.endsWith(`|${doorNo}`)) ||
      doors.find((d) => d.doorIndexCode === String(doorNo));
    if (hit?.name) return hit.name.slice(0, 220);
    return `Puerta ${doorNo}`;
  }

  private toQueueItem(r: {
    id: number;
    status: string;
    title: string;
    severity: string;
    kind: string;
    personId: string | null;
    personName: string | null;
    photoPath: string | null;
    doorNo: number | null;
    doorName: string | null;
    deviceIp: string | null;
    deviceName: string | null;
    occurrenceCount: number;
    ticketRequestId: number | null;
    pushEventId: number | null;
    note: string | null;
    lastOccurredAt: Date;
    updatedAt: Date;
  }): SocQueueItem {
    const doorLabel =
      r.doorName ||
      (r.doorNo != null ? `Puerta ${r.doorNo}` : null) ||
      r.deviceName ||
      r.deviceIp ||
      '';
    return {
      id: socExternalId(r.id),
      status: r.status,
      title: r.title,
      severity: r.severity,
      timestamp: r.lastOccurredAt.toISOString(),
      srcName: doorLabel,
      cameraIndexCode: null,
      doorIndexCode: r.doorNo != null ? String(r.doorNo) : null,
      eventType: r.kind === 'AFTER_HOURS' ? 'acs.after_hours' : 'acs.denied',
      note: r.note,
      ackedAt: r.status === 'ACK' || r.status === 'TICKETED' ? r.updatedAt.toISOString() : null,
      clearedAt: null,
      source: 'push',
      kind: (r.kind === 'AFTER_HOURS' ? 'AFTER_HOURS' : 'DENIED') as SocAlarmKind,
      personId: r.personId,
      personName: r.personName,
      photoPath: r.photoPath,
      doorNo: r.doorNo,
      doorName: r.doorName || doorLabel || null,
      deviceIp: r.deviceIp,
      deviceName: r.deviceName,
      occurrenceCount: r.occurrenceCount,
      ticketRequestId: r.ticketRequestId,
      pushEventId: r.pushEventId,
    };
  }
}
