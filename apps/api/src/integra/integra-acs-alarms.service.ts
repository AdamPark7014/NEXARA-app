import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import {
  alarmEscalationThreshold,
  alarmFingerprint,
  alarmKindLabel,
  alarmSeverity,
  alarmTitle,
  authFailedMinors,
  cameraFaultLabel,
  classifyCameraForAlarm,
  classifyPushForAlarm,
  parseAlarmPolicy,
  parseSocAlarmKind,
  parseSocId,
  socAlarmEventType,
  socExternalId,
  type AlarmPolicy,
  type SocAlarmKind,
} from './integra-acs-alarms.policy';
import { ACS_MAJOR_DEVICE, classifyAcsMinor } from './integra-acs-codes';

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
    /** Repeticiones que declara el propio equipo (Apéndice A.49). */
    activePostCount?: number | null;
  }): Promise<{ alarmId: number; escalated: boolean } | null> {
    const site = await this.loadSite(input.companyId, input.siteId);
    if (!site) return null;

    const policy = parseAlarmPolicy(site.alarmPolicy);

    // Los fallos de reconocimiento solo alarman en ráfaga, así que hay que
    // saber cuántos lleva ese lector. Es UNA consulta y solo en ese caso: en
    // tres meses hubo 48 eventos así, o sea 48 consultas en un trimestre.
    let recentAuthFailures: number | null = null;
    if (classifyAcsMinor(input.major, input.minor).kind === 'auth_failed') {
      recentAuthFailures = await this.countRecentAuthFailures(input, policy);
    }

    const kind = classifyPushForAlarm({
      major: input.major,
      minor: input.minor,
      occurredAt: input.occurredAt,
      policy,
      activePostCount: input.activePostCount,
      recentAuthFailures,
    });
    if (!kind) return null;

    const doorName = await this.resolveDoorName(input.siteId, input.doorNo, input.deviceIp, input.deviceName);
    const fingerprint = alarmFingerprint({
      kind,
      personId: input.personId,
      doorNo: input.doorNo,
      deviceIp: input.deviceIp,
    });
    const title = alarmTitle(kind, {
      personName: input.personName,
      place: doorName || input.deviceName || input.deviceIp,
    });
    const severity = alarmSeverity(kind);

    return this.upsertAlarm({
      site,
      policy,
      kind,
      fingerprint,
      title,
      severity,
      pushEventId: input.pushEventId,
      occurredAt: input.occurredAt,
      personId: input.personId ?? null,
      personName: input.personName ?? null,
      doorNo: input.doorNo ?? null,
      doorName,
      deviceIp: input.deviceIp ?? null,
      deviceName: input.deviceName ?? null,
      photoPath: input.photoPath ?? null,
    });
  }

  /**
   * Salud de cámara: tapada, desenfocada o movida.
   *
   * Es la única alarma del sistema que **no habla de una persona**: habla del
   * propio sistema. Una cámara tapada no genera detecciones, así que sin esto
   * la consola no distingue «no ha pasado nada» de «llevo tres días ciego».
   *
   * Cada avería de una cámara es su propia fila (`source` en la huella): tapada
   * y desenfocada son dos trabajos distintos, no la misma alarma repetida.
   *
   * **Nunca se ha visto una en campo**, porque hasta hoy estos tipos de evento
   * no estaban cableados a `center` y el equipo no los empujaba. `camLabel` de
   * `integra-push.parse.ts` llevaba desde el principio la etiqueta de
   * `shelteralarm` y era código muerto por eso mismo.
   */
  async onCameraEvent(input: {
    companyId: number;
    siteId: number;
    pushEventId: number;
    eventType: string;
    occurredAt: Date;
    deviceIp?: string | null;
    deviceName?: string | null;
    photoPath?: string | null;
  }): Promise<{ alarmId: number; escalated: boolean } | null> {
    const site = await this.loadSite(input.companyId, input.siteId);
    if (!site) return null;

    const kind = classifyCameraForAlarm(input.eventType);
    if (!kind) return null;

    const policy = parseAlarmPolicy(site.alarmPolicy);
    const place =
      (input.deviceName || '').trim() ||
      (await this.resolveDeviceName(input.siteId, input.deviceIp)) ||
      (input.deviceIp || '').trim() ||
      null;

    return this.upsertAlarm({
      site,
      policy,
      kind,
      fingerprint: alarmFingerprint({
        kind,
        deviceIp: input.deviceIp,
        source: input.eventType,
      }),
      title: alarmTitle(kind, { place, cameraEventType: input.eventType }),
      severity: alarmSeverity(kind, { cameraEventType: input.eventType }),
      pushEventId: input.pushEventId,
      occurredAt: input.occurredAt,
      personId: null,
      personName: null,
      doorNo: null,
      // La cámara no es una puerta: el nombre va en `deviceName`, y `doorName`
      // se deja vacío para que la consola no ofrezca abrir una puerta que no
      // existe.
      doorName: null,
      deviceIp: input.deviceIp ?? null,
      deviceName: place,
      photoPath: input.photoPath ?? null,
    });
  }

  /** Abre o repite la alarma y, si toca, la escala a ticket. */
  private async upsertAlarm(args: {
    site: {
      id: number;
      companyId: number;
      serviceClientId: number | null;
      label: string | null;
      name: string;
    };
    policy: AlarmPolicy;
    kind: SocAlarmKind;
    fingerprint: string;
    title: string;
    severity: string;
    pushEventId: number;
    occurredAt: Date;
    personId: string | null;
    personName: string | null;
    doorNo: number | null;
    doorName: string | null;
    deviceIp: string | null;
    deviceName: string | null;
    photoPath: string | null;
  }): Promise<{ alarmId: number; escalated: boolean }> {
    const { site, policy, kind } = args;
    const windowStart = new Date(
      args.occurredAt.getTime() - policy.windowMinutes * 60_000,
    );

    const existing = await this.prisma.integraSocAlarm.findFirst({
      where: {
        siteId: site.id,
        fingerprint: args.fingerprint,
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
          title: args.title,
          severity: args.severity,
          personId: args.personId ?? existing.personId,
          personName: args.personName ?? existing.personName,
          doorNo: args.doorNo ?? existing.doorNo,
          doorName: args.doorName ?? existing.doorName,
          deviceIp: args.deviceIp ?? existing.deviceIp,
          deviceName: args.deviceName ?? existing.deviceName,
          photoPath: args.photoPath || existing.photoPath,
          pushEventId: args.pushEventId,
          occurrenceCount: existing.occurrenceCount + 1,
          lastOccurredAt: args.occurredAt,
        },
      });
    } else {
      row = await this.prisma.integraSocAlarm.create({
        data: {
          companyId: site.companyId,
          siteId: site.id,
          kind,
          status: 'OPEN',
          fingerprint: args.fingerprint,
          title: args.title,
          severity: args.severity,
          personId: args.personId,
          personName: args.personName,
          doorNo: args.doorNo,
          doorName: args.doorName,
          deviceIp: args.deviceIp,
          deviceName: args.deviceName,
          photoPath: args.photoPath,
          pushEventId: args.pushEventId,
          occurrenceCount: 1,
          firstOccurredAt: args.occurredAt,
          lastOccurredAt: args.occurredAt,
        },
      });
    }

    let escalated = false;
    if (
      !row.ticketRequestId &&
      row.occurrenceCount >= alarmEscalationThreshold(kind, policy) &&
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

  private async loadSite(companyId: number, siteId: number) {
    const site = await this.prisma.integraSite.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        companyId: true,
        alarmPolicy: true,
        serviceClientId: true,
        label: true,
        name: true,
      },
    });
    if (!site || site.companyId !== companyId) return null;
    return site;
  }

  /**
   * Cuántos fallos de reconocimiento lleva ESE lector en la ventana.
   *
   * Se cuenta sobre lo ya persistido en vez de fiarse solo de
   * `activePostCount`: el campo está documentado para el aviso de cámara y no
   * hay confirmación de que el terminal ACS lo mande. Contar es barato aquí —
   * 48 eventos en tres meses— y funciona con cualquier firmware.
   */
  private async countRecentAuthFailures(
    input: {
      siteId: number;
      occurredAt: Date;
      deviceIp?: string | null;
      doorNo?: number | null;
    },
    policy: AlarmPolicy,
  ): Promise<number> {
    const since = new Date(
      input.occurredAt.getTime() - policy.authFailWindowMinutes * 60_000,
    );
    return this.prisma.integraPushEvent.count({
      where: {
        siteId: input.siteId,
        major: ACS_MAJOR_DEVICE,
        minor: { in: authFailedMinors() },
        occurredAt: { gte: since, lte: input.occurredAt },
        // Mismo lector: un fallo en Acceso General y otro en Sala de Juntas no
        // son la misma avería.
        ...(input.deviceIp ? { deviceIp: input.deviceIp } : {}),
      },
    });
  }

  /**
   * Nombre del equipo por IP, para que la alarma diga DÓNDE.
   *
   * Se busca en `IntegraDevice`, no en `IntegraCamera`: la cámara del espejo no
   * tiene columna de IP —la guarda dentro de `raw.source.ipAddress`— y filtrar
   * por JSON para pintar un título no compensa. Lo normal es que ni haga falta:
   * el propio aviso trae `channelName` y eso ya es el nombre de la cámara.
   */
  private async resolveDeviceName(
    siteId: number,
    deviceIp?: string | null,
  ): Promise<string | null> {
    const ip = (deviceIp || '').trim();
    if (!ip) return null;
    const dev = await this.prisma.integraDevice.findFirst({
      where: { siteId, ip },
      select: { name: true },
    });
    return dev?.name?.trim() ? dev.name.trim().slice(0, 220) : null;
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
      `Tipo: ${alarmKindLabel(parseSocAlarmKind(row.kind))}`,
      `Persona: ${row.personName || row.personId || 'desconocida'}`,
      `Puerta: ${door}`,
      `Repeticiones: ${row.occurrenceCount} (umbral ${alarmEscalationThreshold(
        parseSocAlarmKind(row.kind),
        policy,
      )} / ${policy.windowMinutes} min)`,
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
    // Las filas anteriores a las alarmas de puerta y cámara solo traen DENIED o
    // AFTER_HOURS; `parseSocAlarmKind` las deja como estaban y evita que una
    // fila con un `kind` nuevo se enseñe como «acceso denegado», que era lo que
    // hacía el ternario que había aquí.
    const kind = parseSocAlarmKind(r.kind);
    return {
      id: socExternalId(r.id),
      status: r.status,
      title: r.title,
      severity: r.severity,
      timestamp: r.lastOccurredAt.toISOString(),
      srcName: doorLabel,
      cameraIndexCode: null,
      doorIndexCode: r.doorNo != null ? String(r.doorNo) : null,
      eventType: socAlarmEventType(kind),
      note: r.note,
      ackedAt: r.status === 'ACK' || r.status === 'TICKETED' ? r.updatedAt.toISOString() : null,
      clearedAt: null,
      source: 'push',
      kind,
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
