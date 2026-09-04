import { randomBytes, createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Observable, Subject } from 'rxjs';
import {
  clearHttpNotificationHost,
  disableFieldDetection,
  enableMaxSmartDetection,
  enableMotionDetection,
  enableNvrParkingVehicleDetection,
  readHttpNotificationHosts,
  setHttpNotificationHost,
} from '../hikvision-isapi';
import { resolveUploadsDir } from '../common/uploads-path';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';
import { readLocalPersonFace } from './integra-person-media';

/** Fila lista para consola / SSE (ISO dates, sin `raw`). */
export type PushEventDto = {
  id: number;
  deviceIp: string;
  deviceName: string | null;
  eventType: string;
  major: number | null;
  minor: number | null;
  label: string | null;
  occurredAt: string;
  personId: string | null;
  personName: string | null;
  doorNo: number | null;
  verifyMode: string | null;
  photoPath: string | null;
  /** granted | denied | null (no ACS / desconocido). */
  outcome: 'granted' | 'denied' | null;
  targets: Array<{ type: string; x: number; y: number; w: number; h: number }> | null;
};

/** Acceso concedido (entrada / salida / genérico). */
const GRANTED_MINORS = [1, 75, 76];
/** Acceso denegado típico en terminales DS-K1T. */
const DENIED_MINORS = [21, 22, 23, 24, 27, 28, 29, 31, 32];

/**
 * Recepción de eventos **empujados** por los equipos.
 *
 * El sondeo que había pregunta cada 4 s por una ventana de 2 h: llega tarde,
 * repite y no trae imagen. Con el empuje el evento entra en menos de un
 * segundo, y esa diferencia es justo la que permite fotografiar a quien acaba
 * de pasar: el terminal no manda su captura —medido, 596 eventos del
 * alertStream sin un solo JPEG— pero como cámara responde en ~300 ms, así que
 * la foto la toma NEXARA en cuanto el evento aterriza.
 *
 * Autenticación: los equipos no saben hablar nuestro JWT. Llevan un token por
 * sitio en la propia URL (`urlLen max=128` en el firmware, así que va corto) y
 * en la base solo queda su sha256.
 */

/**
 * Ruido medido en Oficinas (~205 evt/min): VMD ~83 %, duration ~14 %,
 * heartBeat ~2 %, ACS <1 %. Sin filtrar, list/SSE/índices se ahogan y los
 * accesos de negocio dejan de verse snappy.
 *
 * - DROP: ni fila ni SSE (latidos / duración del firmware).
 * - SKIP_STORE: tampoco se persisten (VMD / videoloss); fielddetection ya
 *   trae la caja útil para el overlay. Histórico se poda agresivo.
 */
const DROP_TYPES = new Set(['heartBeat', 'duration']);
const SKIP_STORE_TYPES = new Set(['heartBeat', 'duration', 'VMD', 'videoloss']);
const NOISE_TYPES = ['heartBeat', 'duration', 'VMD', 'videoloss'] as const;
/** Histórico de ruido: horas, no días. */
const NOISE_TTL_HOURS = 6;
/** Todo lo demás —accesos, detecciones— aguanta un trimestre. */
const EVENT_TTL_DAYS = 90;
/** Caché corta del token de empuje (evita 1 SELECT/evento a 200/min). */
const TOKEN_CACHE_MS = 30_000;

/** Un evento ya normalizado, venga en XML de cámara o en JSON de terminal. */
export type NormalizedEvent = {
  deviceIp: string;
  deviceName: string | null;
  eventType: string;
  major: number | null;
  minor: number | null;
  label: string | null;
  occurredAt: Date;
  personId: string | null;
  personName: string | null;
  doorNo: number | null;
  verifyMode: string | null;
  targets: Array<{ type: string; x: number; y: number; w: number; h: number }> | null;
  raw: unknown;
};

@Injectable()
export class IntegraPushService {
  private readonly logger = new Logger(IntegraPushService.name);
  /** Un canal por sitio: la consola se engancha y ve los eventos al vuelo. */
  private readonly streams = new Map<number, Subject<PushEventDto>>();
  /** siteId:tokenHash → sitio resuelto (TTL corto). */
  private readonly tokenCache = new Map<
    string,
    { site: { id: number; companyId: number; pushTokenHash: string | null }; expires: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
  ) {}

  stream(siteId: number): Observable<PushEventDto> {
    let s = this.streams.get(siteId);
    if (!s) {
      s = new Subject<PushEventDto>();
      this.streams.set(siteId, s);
    }
    return s.asObservable();
  }

  /**
   * Publica solo si hay oyentes SSE. No crear Subject «por si acaso»: bajo
   * carga de VMD eso retenía Subjects muertos y seguía encolando trabajo.
   */
  private publish(siteId: number, dto: PushEventDto) {
    const s = this.streams.get(siteId);
    if (!s || !s.observed) return;
    s.next(dto);
  }

  private toDto(row: {
    id: number;
    deviceIp: string;
    deviceName: string | null;
    eventType: string;
    major?: number | null;
    minor?: number | null;
    label: string | null;
    occurredAt: Date;
    personId: string | null;
    personName: string | null;
    doorNo: number | null;
    verifyMode: string | null;
    photoPath: string | null;
    targets: unknown;
  }): PushEventDto {
    const major = row.major ?? null;
    const minor = row.minor ?? null;
    return {
      id: row.id,
      deviceIp: row.deviceIp,
      deviceName: row.deviceName,
      eventType: row.eventType,
      major,
      minor,
      label: row.label,
      occurredAt: row.occurredAt.toISOString(),
      personId: row.personId,
      personName: row.personName,
      doorNo: row.doorNo,
      verifyMode: row.verifyMode,
      photoPath: row.photoPath,
      outcome: acsOutcome(major, minor),
      targets: (Array.isArray(row.targets) ? row.targets : null) as PushEventDto['targets'],
    };
  }

  /** Token nuevo para un sitio. Se devuelve en claro una sola vez. */
  async issueToken(siteId: number): Promise<{ token: string; url: string }> {
    const site = await this.prisma.integraSite.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException(`Sitio ${siteId} no existe`);
    // 24 hex = 96 bits. La URL entera tiene que caber en 128 caracteres.
    const token = randomBytes(12).toString('hex');
    const pushTokenHash = sha256(token);
    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { pushTokenHash, pushTokenAt: new Date() },
    });
    this.invalidateTokenCache(siteId);
    return { token, url: `${publicBase()}/api/integra/hik/${siteId}/${token}` };
  }

  private invalidateTokenCache(siteId: number) {
    const prefix = `${siteId}:`;
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(prefix)) this.tokenCache.delete(key);
    }
  }

  /** Resuelve el sitio a partir del token de la URL (con caché corta). */
  async siteForToken(siteId: number, token: string) {
    const hash = sha256(token);
    const cacheKey = `${siteId}:${hash}`;
    const hit = this.tokenCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.site;

    const site = await this.prisma.integraSite.findUnique({
      where: { id: siteId },
      select: { id: true, companyId: true, pushTokenHash: true },
    });
    if (!site?.pushTokenHash) throw new NotFoundException('Sitio sin token de eventos');
    if (site.pushTokenHash !== hash) throw new NotFoundException('Token no válido');
    this.tokenCache.set(cacheKey, { site, expires: Date.now() + TOKEN_CACHE_MS });
    return site;
  }

  /**
   * Poda nocturna.
   *
   * El ruido y lo que importa envejecen distinto. Un latido o un aviso de
   * movimiento no dice nada al día siguiente, y entran a cientos por hora: sin
   * podarlos la tabla se come el disco de un servidor que además aloja a otros
   * siete negocios. Un acceso, en cambio, es el registro de quién entró y
   * cuándo, y eso se guarda.
   *
   * Las fotos huérfanas se van con su fila: una foto de una cara sin el evento
   * que la explica no es un dato, es un archivo de gente suelto.
   */
  @Cron('27 4 * * *')
  async purgeOldEvents() {
    const now = Date.now();
    const noiseBefore = new Date(now - NOISE_TTL_HOURS * 3_600_000);
    const anyBefore = new Date(now - EVENT_TTL_DAYS * 86_400_000);

    const doomed = await this.prisma.integraPushEvent.findMany({
      where: {
        OR: [
          { eventType: { in: [...NOISE_TYPES] }, occurredAt: { lt: noiseBefore } },
          { occurredAt: { lt: anyBefore } },
        ],
      },
      select: { id: true, photoPath: true },
    });
    if (doomed.length === 0) return { deleted: 0, photos: 0 };

    let photos = 0;
    for (const row of doomed) {
      if (!row.photoPath) continue;
      const rel = row.photoPath.replace(/^\/uploads\//, '');
      try {
        await rm(resolveUploadsDir(rel), { force: true });
        photos += 1;
      } catch {
        // Un fichero que ya no está no impide borrar la fila.
      }
    }

    const { count } = await this.prisma.integraPushEvent.deleteMany({
      where: { id: { in: doomed.map((d) => d.id) } },
    });
    this.logger.log(`Poda de eventos: ${count} filas, ${photos} fotos`);
    return { deleted: count, photos };
  }

  /**
   * Listado de eventos empujados.
   *
   * Por defecto (sin filtros de negocio) sirve al overlay/SSE: todo lo reciente.
   * Con `scope=acs` prioriza control de acceso (major=5) y excluye heartBeat/VMD.
   * `afterId` = sondeo incremental barato (índice companyId+id).
   * `beforeId` = paginación hacia atrás sin OFFSET.
   */
  async listEvents(
    companyId: number,
    opts: {
      siteId?: number | null;
      personId?: string | null;
      personName?: string | null;
      deviceIp?: string | null;
      take: number;
      /** Solo filas nuevas tras este id (sondeo incremental barato). */
      afterId?: number | null;
      /** Página siguiente: ids estrictamente menores (historial hacia atrás). */
      beforeId?: number | null;
      /** Ventana reciente en ms (semilla de overlay / badges). */
      sinceMs?: number | null;
      /** Solo eventos con caja o con nombre (live UI). */
      liveOnly?: boolean;
      /**
       * `acs` = AccessControllerEvent major 5 (vista de negocio).
       * `noise` = heartBeat/VMD/… · `all` = sin filtro de tipo (diagnóstico).
       * `null` / omitido = útil (excluye ruido) — default para overlay/poll.
       */
      scope?: 'acs' | 'all' | 'noise' | null;
      /** Solo concedidos o denegados (requiere scope acs o major 5). */
      outcome?: 'granted' | 'denied' | null;
      from?: Date | null;
      to?: Date | null;
    },
  ) {
    const t0 = Date.now();
    const afterId =
      opts.afterId != null && Number.isFinite(opts.afterId) && opts.afterId > 0
        ? Math.floor(opts.afterId)
        : null;
    const beforeId =
      opts.beforeId != null && Number.isFinite(opts.beforeId) && opts.beforeId > 0
        ? Math.floor(opts.beforeId)
        : null;
    const sinceMs =
      opts.sinceMs != null && Number.isFinite(opts.sinceMs) && opts.sinceMs > 0
        ? Math.min(Math.floor(opts.sinceMs), 180_000)
        : null;

    const scope = opts.scope || 'all';
    const personName = opts.personName?.trim() || null;
    const deviceIp = opts.deviceIp?.trim() || null;

    const occurredAt: { gte?: Date; lte?: Date } = {};
    if (opts.from && Number.isFinite(opts.from.getTime())) occurredAt.gte = opts.from;
    if (opts.to && Number.isFinite(opts.to.getTime())) occurredAt.lte = opts.to;
    if (sinceMs && !occurredAt.gte) {
      occurredAt.gte = new Date(Date.now() - sinceMs);
    }

    const where: Record<string, unknown> = {
      companyId,
      ...(opts.siteId ? { siteId: opts.siteId } : {}),
      ...(opts.personId ? { personId: opts.personId } : {}),
      ...(deviceIp ? { deviceIp } : {}),
      ...(personName
        ? { personName: { contains: personName, mode: 'insensitive' as const } }
        : {}),
      ...(afterId ? { id: { gt: afterId } } : {}),
      ...(beforeId && !afterId ? { id: { lt: beforeId } } : {}),
      ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
    };

    if (scope === 'acs') {
      where.eventType = 'AccessControllerEvent';
      where.major = 5;
    } else if (scope === 'noise') {
      where.eventType = { in: NOISE_TYPES };
    }

    if (opts.outcome === 'granted') {
      where.major = 5;
      where.minor = { in: GRANTED_MINORS };
    } else if (opts.outcome === 'denied') {
      where.major = 5;
      where.minor = { in: DENIED_MINORS };
    }

    const rows = await this.prisma.integraPushEvent.findMany({
      where,
      // Incremental: id ASC para no saltar huecos. Semilla/listado: lo más nuevo.
      orderBy: afterId ? { id: 'asc' } : [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: opts.take,
      select: {
        id: true,
        deviceIp: true,
        deviceName: true,
        eventType: true,
        major: true,
        minor: true,
        label: true,
        occurredAt: true,
        personId: true,
        personName: true,
        doorNo: true,
        verifyMode: true,
        photoPath: true,
        targets: true,
      },
    });

    let items = rows.map((r) => this.toDto(r));
    if (opts.liveOnly && !afterId && scope !== 'acs') {
      items = items.filter((r) => {
        const hasTargets = Array.isArray(r.targets) && r.targets.length > 0;
        return hasTargets || Boolean(r.personName);
      });
    }

    const ms = Date.now() - t0;
    const oldestId = items.length ? Math.min(...items.map((i) => i.id)) : null;
    const newestId = items.length ? Math.max(...items.map((i) => i.id)) : null;
    return {
      items,
      total: items.length,
      ms,
      hasMore: items.length >= opts.take,
      nextBeforeId: afterId ? null : oldestId,
      newestId,
    };
  }

  /**
   * KPIs del día laboral (zona MX): entradas, denegados, personas únicas, en sitio.
   * Consultas acotadas a major=5 + ventana desde medianoche local aprox.
   */
  async eventStats(
    companyId: number,
    opts: { siteId?: number | null; tz?: string } = {},
  ) {
    const t0 = Date.now();
    const tz = opts.tz || 'America/Mexico_City';
    const now = new Date();
    const today = dayIn(now, tz);
    // Desde ~00:00 local: 30 h cubre DST y deriva de reloj de terminal.
    const from = new Date(now.getTime() - 30 * 3600_000);

    const baseWhere = {
      companyId,
      ...(opts.siteId ? { siteId: opts.siteId } : {}),
      major: 5,
      eventType: 'AccessControllerEvent',
      occurredAt: { gte: from },
    };

    const [grantedRows, deniedRows, occupancy] = await Promise.all([
      this.prisma.integraPushEvent.findMany({
        where: { ...baseWhere, minor: { in: GRANTED_MINORS } },
        select: { personId: true, occurredAt: true },
      }),
      this.prisma.integraPushEvent.findMany({
        where: { ...baseWhere, minor: { in: DENIED_MINORS } },
        select: { occurredAt: true },
      }),
      this.occupancy(companyId, { siteId: opts.siteId, tz }),
    ]);

    const grantedToday = grantedRows.filter((r) => dayIn(r.occurredAt, tz) === today);
    const deniedToday = deniedRows.filter((r) => dayIn(r.occurredAt, tz) === today);
    const unique = new Set(
      grantedToday.map((r) => r.personId).filter((id): id is string => Boolean(id)),
    );

    return {
      day: today,
      entradas: grantedToday.length,
      denegados: deniedToday.length,
      unicos: unique.size,
      enSitio: occupancy.total,
      ms: Date.now() - t0,
    };
  }

  /**
   * Asistencia del día, deducida de los accesos.
   *
   * Estos terminales no marcan entrada ni salida —`AttendanceMode` responde
   * `notSupport`—, así que no hay un dato «fichaje» que leer: se deduce del
   * primer y el último acceso concedido de cada persona en el día, que es como
   * funciona cualquier control de accesos usado como reloj checador.
   *
   * Las horas se cuentan en la zona del sitio, no en UTC: si no, todo lo de
   * después de las 18:00 hora de México cae en el día siguiente.
   */
  async attendance(
    companyId: number,
    opts: { siteId?: number | null; from: Date; to: Date; personId?: string | null; tz?: string },
  ) {
    const tz = opts.tz || 'America/Mexico_City';
    const rows = await this.prisma.integraPushEvent.findMany({
      where: {
        companyId,
        ...(opts.siteId ? { siteId: opts.siteId } : {}),
        ...(opts.personId ? { personId: opts.personId } : {}),
        // major 5 = autenticación. Sin persona no hay a quién apuntarle nada.
        major: 5,
        personId: { not: null },
        occurredAt: { gte: opts.from, lte: opts.to },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        personId: true,
        personName: true,
        occurredAt: true,
        deviceName: true,
        photoPath: true,
        minor: true,
        verifyMode: true,
      },
    });

    const days = new Map<
      string,
      {
        day: string;
        personId: string;
        personName: string | null;
        firstAt: Date;
        lastAt: Date;
        firstDoor: string | null;
        firstPhoto: string | null;
        passes: number;
        denied: number;
      }
    >();

    for (const r of rows) {
      const personId = r.personId as string;
      const day = dayIn(r.occurredAt, tz);
      const key = `${day}|${personId}`;
      const granted = GRANTED_MINORS.includes(r.minor ?? -1);
      const cur = days.get(key);
      if (!cur) {
        days.set(key, {
          day,
          personId,
          personName: r.personName,
          firstAt: r.occurredAt,
          lastAt: r.occurredAt,
          firstDoor: r.deviceName,
          firstPhoto: r.photoPath,
          passes: granted ? 1 : 0,
          denied: granted ? 0 : 1,
        });
        continue;
      }
      cur.lastAt = r.occurredAt;
      if (granted) cur.passes += 1;
      else cur.denied += 1;
      if (!cur.firstPhoto && r.photoPath) cur.firstPhoto = r.photoPath;
      if (!cur.personName && r.personName) cur.personName = r.personName;
    }

    const items = [...days.values()]
      .map((d) => ({
        ...d,
        firstAt: d.firstAt.toISOString(),
        lastAt: d.lastAt.toISOString(),
        // Un solo paso en el día no es una jornada: es una entrada sin salida.
        minutes:
          d.passes > 1
            ? Math.round((new Date(d.lastAt).getTime() - new Date(d.firstAt).getTime()) / 60000)
            : null,
      }))
      .sort((a, b) => (a.day === b.day ? a.firstAt.localeCompare(b.firstAt) : b.day.localeCompare(a.day)));

    return { items, total: items.length };
  }

  /**
   * Quién está «en sitio» hoy: último acceso concedido del día sin un
   * denegado/salida que lo cierre. No es PeopleCounting VCA (firmware false).
   */
  async occupancy(
    companyId: number,
    opts: { siteId?: number | null; tz?: string } = {},
  ) {
    const tz = opts.tz || 'America/Mexico_City';
    const now = new Date();
    // Ventana local aproximada: últimas 18 h cubre el día laboral MX.
    const from = new Date(now.getTime() - 18 * 3600_000);
    const rows = await this.prisma.integraPushEvent.findMany({
      where: {
        companyId,
        ...(opts.siteId ? { siteId: opts.siteId } : {}),
        major: 5,
        personId: { not: null },
        occurredAt: { gte: from },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        personId: true,
        personName: true,
        occurredAt: true,
        deviceName: true,
        deviceIp: true,
        photoPath: true,
        minor: true,
        verifyMode: true,
      },
    });

    const today = dayIn(now, tz);
    type Occ = {
      personId: string;
      personName: string | null;
      lastAt: Date;
      lastDoor: string | null;
      lastPhoto: string | null;
      verifyMode: string | null;
      inside: boolean;
      passes: number;
    };
    const byPerson = new Map<string, Occ>();

    for (const r of rows) {
      if (dayIn(r.occurredAt, tz) !== today) continue;
      const personId = r.personId as string;
      const granted = GRANTED_MINORS.includes(r.minor ?? -1);
      const cur = byPerson.get(personId);
      if (!cur) {
        byPerson.set(personId, {
          personId,
          personName: r.personName,
          lastAt: r.occurredAt,
          lastDoor: r.deviceName,
          lastPhoto: r.photoPath,
          verifyMode: r.verifyMode,
          inside: granted,
          passes: granted ? 1 : 0,
        });
        continue;
      }
      cur.lastAt = r.occurredAt;
      cur.lastDoor = r.deviceName;
      if (r.photoPath) cur.lastPhoto = r.photoPath;
      if (r.verifyMode) cur.verifyMode = r.verifyMode;
      if (!cur.personName && r.personName) cur.personName = r.personName;
      if (granted) {
        cur.inside = true;
        cur.passes += 1;
      } else {
        // Denegado no saca; minor 76 suele ser salida concedida en algunos firmwares.
        if (r.minor === 76) cur.inside = false;
      }
    }

    const items = [...byPerson.values()]
      .filter((p) => p.inside)
      .map((p) => ({
        ...p,
        lastAt: p.lastAt.toISOString(),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

    return {
      day: today,
      total: items.length,
      items,
      note: 'Ocupación deducida de accesos concedidos hoy. No es conteo óptico de cámaras.',
    };
  }

  /**
   * Eventos de vehículo (fielddetection con target vehicle / human,vehicle).
   * Sin texto de placa en este parque: no hay ITC/ANPR. Listo para OCR cuando
   * llegue cámara de placas.
   */
  async plateEvents(
    companyId: number,
    opts: { siteId?: number | null; limit?: number } = {},
  ) {
    const take = Math.min(Math.max(opts.limit ?? 40, 1), 100);
    const siteId = opts.siteId ?? null;
    const rows = await this.prisma.integraPushEvent.findMany({
      where: {
        companyId,
        ...(siteId ? { siteId } : {}),
        occurredAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { id: 'desc' },
      take: take * 4,
      select: {
        id: true,
        deviceIp: true,
        deviceName: true,
        eventType: true,
        label: true,
        occurredAt: true,
        targets: true,
        photoPath: true,
        raw: true,
      },
    });

    const items: Array<{
      id: number;
      deviceIp: string;
      deviceName: string | null;
      occurredAt: string;
      plate: string | null;
      label: string | null;
      photoPath: string | null;
      anpr: boolean;
    }> = [];

    for (const r of rows) {
      const targets = Array.isArray(r.targets) ? (r.targets as Array<{ type?: string }>) : [];
      // AcuSense/NVR mandan "vehicle" o "human,vehicle" — no exigir igualdad exacta.
      const hasVehicle = targets.some((t) =>
        String(t?.type || '')
          .toLowerCase()
          .split(/[,\s]+/)
          .includes('vehicle'),
      );
      const raw = (r.raw && typeof r.raw === 'object' ? r.raw : {}) as Record<string, unknown>;
      const plate =
        (typeof raw.licensePlate === 'string' && raw.licensePlate) ||
        (typeof raw.plateNo === 'string' && raw.plateNo) ||
        null;
      if (!hasVehicle && !plate) continue;
      items.push({
        id: r.id,
        deviceIp: r.deviceIp,
        deviceName: r.deviceName,
        occurredAt: r.occurredAt.toISOString(),
        plate,
        label: r.label || (plate ? 'Placa' : 'Vehículo'),
        photoPath: r.photoPath,
        anpr: Boolean(plate),
      });
      if (items.length >= take) break;
    }

    const vehicleSources = await this.vehicleCapableCameras(companyId, siteId);

    return {
      items,
      total: items.length,
      note:
        items.length === 0
          ? 'Sin detecciones vehicle en los últimos 30 min. La PTZ DarkFighter no clasifica vehículos ni lee placas; mira Office Entrance / Azotea / Escalera (FieldDetection en NVR). OCR solo con cámara ITC.'
          : 'Sin OCR en este parque: solo clasificación vehicle (FieldDetection). plate llega con cámara ITC/ANPR.',
      ptz: {
        fieldDetection: false,
        anpr: false,
        motion: true,
        note: 'DS-2DF8C442: video + PTZ + motion. FieldDetection/ANPR/ITC = notSupport.',
      },
      vehicleSources,
    };
  }

  /** Cámaras del sitio con FieldDetection que admite vehicle (espejo + heurística PoE). */
  private async vehicleCapableCameras(companyId: number, siteId: number | null) {
    const cams = await this.prisma.integraCamera.findMany({
      where: {
        companyId,
        ...(siteId ? { siteId } : {}),
      },
      select: { name: true, cameraIndexCode: true, raw: true },
      orderBy: { name: 'asc' },
    });
    const out: Array<{ name: string; sourceIp: string | null; via: 'direct' | 'nvr' }> = [];
    for (const c of cams) {
      const raw = (c.raw && typeof c.raw === 'object' ? c.raw : {}) as {
        anprCapable?: boolean;
        ptz?: boolean;
        source?: { ipAddress?: string | null; connMode?: string | null };
      };
      if (raw.ptz === true) continue;
      if (raw.anprCapable === true) {
        out.push({
          name: c.name,
          sourceIp: raw.source?.ipAddress ?? null,
          via: 'direct',
        });
        continue;
      }
      // PoE NVR: FieldDetection ch 1/2/9/10 verificado con detectionTarget human,vehicle.
      const ip = raw.source?.ipAddress || '';
      const plug =
        raw.source?.connMode === 'plugplay' || ip.startsWith('192.168.254.');
      if (plug && /entrance|azotea|escalera|office/i.test(c.name)) {
        out.push({ name: c.name, sourceIp: ip || null, via: 'nvr' });
      }
    }
    return out;
  }

  /**
   * Deja a todos los equipos del sitio avisando a NEXARA.
   *
   * Se emite un token nuevo en cada pasada: si el anterior se filtró en un log
   * o en la pantalla de alguien, deja de valer en cuanto se reconfigura. Como
   * el token va en la URL de todos los equipos, reconfigurarlos es justo lo que
   * se está haciendo.
   */
  async wireDevices(
    companyId: number,
    siteId: number,
    opts: { detection?: boolean; rotateToken?: boolean } = {},
  ) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.isapiForHost) {
      throw new BadRequestException('El empuje de eventos solo aplica a sitios ISAPI');
    }

    // Reusar token vivo si ya hay equipos cableados: rotar tumba el httpHosts
    // de PTZ/ACS hasta reconfigurar todos. El NVR PoE (vehicle) depende de esto.
    let url: string;
    let token: string | null = null;
    if (opts.rotateToken === false) {
      const reused = await this.livePushUrlFromDevices(resolved);
      if (reused) {
        url = reused;
      } else {
        const issued = await this.issueToken(siteId);
        token = issued.token;
        url = issued.url;
      }
    } else {
      const issued = await this.issueToken(siteId);
      token = issued.token;
      url = issued.url;
    }

    const devices = await this.prisma.integraDevice.findMany({
      where: { siteId, ip: { not: null } },
      select: { ip: true, name: true, kind: true },
    });
    // Varias filas comparten IP (un terminal es ACS y a la vez fuente de video).
    const byIp = new Map<string, { name: string; kind: string }>();
    // Cabecera NVR: FieldDetection de PoE (Office Entrance/Azotea) solo empuja si
    // el grabador tiene httpHosts. Las IPs 192.168.254.x no son alcanzables.
    if (resolved.host) {
      byIp.set(resolved.host.replace(/^https?:\/\//, '').split(':')[0], {
        name: 'NVR cabecera',
        kind: 'ENCODE',
      });
    }
    for (const d of devices) {
      const ip = d.ip as string;
      const prev = byIp.get(ip);
      // ACS manda sobre ENCODE: decide si se le piden imágenes o no.
      if (!prev || d.kind === 'ACS') byIp.set(ip, { name: d.name, kind: d.kind });
    }

    const results: Array<{
      ip: string;
      name: string;
      kind: string;
      push: 'ok' | string;
      detection?: 'ok' | 'no-soportado' | string;
    }> = [];

    for (const [ip, info] of byIp) {
      // PoE interno del NVR: no existe en la LAN; el smart va por el grabador.
      if (ip.startsWith('192.168.254.')) {
        results.push({
          ip,
          name: info.name,
          kind: info.kind,
          push: 'skip-plugplay',
        });
        continue;
      }
      const client = resolved.isapiForHost(ip);
      if (!client) continue;
      const isCamera = info.kind !== 'ACS';
      const isNvrHead =
        ip === resolved.host.replace(/^https?:\/\//, '').split(':')[0];
      const isPtz = /ptz|\.179$/i.test(`${info.name} ${ip}`);
      const entry: (typeof results)[number] = {
        ip,
        name: info.name,
        kind: info.kind,
        push: 'ok',
      };

      try {
        // Solo las cámaras declaran `uploadImagesDataType`: pedírselo a un
        // terminal es mandarle un campo que no conoce.
        await setHttpNotificationHost(client, { url, withImages: isCamera });
      } catch (e) {
        entry.push = describeErr(e);
      }

      if (opts.detection && isCamera) {
        try {
          if (isNvrHead) {
            const nvr = await enableNvrParkingVehicleDetection(client);
            const ok = nvr.filter((r) => r.ok).length;
            entry.detection =
              ok > 0
                ? `nvr-vehicle-ok:${ok}/${nvr.length}`
                : nvr.map((r) => r.error || 'fail').join(';') || 'no-soportado';
          } else if (isPtz) {
            // DarkFighter: FieldDetection 403; motion sí (sensibilidad > 0).
            entry.detection = (await enableMotionDetection(client, 1, 70))
              ? 'motion-ok'
              : 'no-soportado';
          } else {
            // AcuSense (.171–.178): Field+Line+FaceDetect+Motion al máximo.
            // Almacén puede ver carritos → human,vehicle en una región vía target.
            const vehicleish = /almacen|warehouse|entrada|entrance|azotea|parking/i.test(
              info.name,
            );
            const r = await enableMaxSmartDetection(client, {
              fieldTarget: vehicleish ? 'human,vehicle' : 'human',
            });
            entry.detection = r.field
              ? `max:fd=${r.field}/ln=${r.line}/fc=${r.face}/md=${r.motion}/au=${r.audio}/sub=${r.substream}`
              : 'no-soportado';
          }
        } catch (e) {
          entry.detection = describeErr(e);
        }
      }
      results.push(entry);
    }

    return {
      url,
      token,
      devices: results,
      ok: results.filter((r) => r.push === 'ok').length,
      total: results.length,
    };
  }

  /**
   * Recupera la URL de empuje ya escrita en algún equipo (p. ej. PTZ), para
   * cablear el NVR sin rotar el token y tumbar el resto.
   */
  private async livePushUrlFromDevices(
    resolved: Awaited<ReturnType<IntegraSiteService['resolveClient']>>,
  ): Promise<string | null> {
    if (!resolved.isapiForHost) return null;
    const candidates = [
      '192.168.9.179',
      '192.168.9.173',
      '192.168.9.160',
      resolved.host.replace(/^https?:\/\//, '').split(':')[0],
    ].filter(Boolean);
    for (const ip of candidates) {
      try {
        const client = resolved.isapiForHost(ip);
        if (!client) continue;
        const hosts = await readHttpNotificationHosts(client);
        const hit = hosts.find((h) => /\/api\/integra\/hik\//.test(h.url));
        if (hit) return hit.url;
      } catch {
        /* siguiente */
      }
    }
    return null;
  }

  /** Deshace lo anterior: los equipos dejan de avisar y de detectar. */
  async unwireDevices(companyId: number, siteId: number, opts: { detection?: boolean } = {}) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.isapiForHost) throw new BadRequestException('Sitio no ISAPI');
    const devices = await this.prisma.integraDevice.findMany({
      where: { siteId, ip: { not: null } },
      select: { ip: true, kind: true },
    });
    const ips = [...new Set(devices.map((d) => d.ip as string))];
    const results: Array<{ ip: string; push: string; detection?: string }> = [];
    for (const ip of ips) {
      const client = resolved.isapiForHost(ip);
      if (!client) continue;
      const entry: (typeof results)[number] = { ip, push: 'ok' };
      try {
        await clearHttpNotificationHost(client);
      } catch (e) {
        entry.push = describeErr(e);
      }
      if (opts.detection) {
        try {
          entry.detection = (await disableFieldDetection(client)) ? 'ok' : 'no-soportado';
        } catch (e) {
          entry.detection = describeErr(e);
        }
      }
      results.push(entry);
    }
    // El token deja de valer: aunque un equipo se quede mal configurado, sus
    // avisos ya no entran.
    await this.prisma.integraSite.update({
      where: { id: siteId },
      data: { pushTokenHash: null, pushTokenAt: null },
    });
    return { devices: results };
  }

  /**
   * Guarda el evento y, si toca, le pone cara.
   *
   * Solo se fotografía lo que lo merece —un acceso concedido, una persona
   * detectada—: disparar una captura por cada latido del equipo llenaría el
   * disco de fotos de un pasillo vacío.
   *
   * Orden de foto (rápido → lento):
   * 1. JPEG que el equipo empujó (cámaras con httpHosts+images)
   * 2. JPEG enrolado en NEXARA (Face ID) — **inmediato**, sin ISAPI
   * 3. Snapshot canal 102→101 en background (~100–300 ms) y re-SSE
   *
   * Publica por SSE **antes** del snapshot ISAPI: el nombre y el FaceRect
   * no deben esperar a la JPEG del canal.
   */
  async ingest(
    site: { id: number; companyId: number },
    ev: NormalizedEvent,
    pushedImage?: Buffer | null,
  ) {
    let photoPath: string | null = null;
    if (pushedImage?.length) {
      // Si el equipo mandó la imagen, esa es la buena: es el fotograma exacto
      // del evento. Solo las cámaras la mandan; los terminales, nunca.
      photoPath = await this.savePhoto(site, ev, pushedImage).catch(() => null);
    }

    // Acceso ACS con personId: cara enrolada al instante (banner/events).
    if (
      !photoPath &&
      ev.personId &&
      ev.eventType === 'AccessControllerEvent' &&
      ev.major === 5
    ) {
      const local = readLocalPersonFace(site.companyId, ev.personId);
      if (local?.buffer?.length) {
        photoPath = await this.savePhoto(site, ev, local.buffer).catch(() => null);
      }
    }

    const row = await this.prisma.integraPushEvent.create({
      data: {
        companyId: site.companyId,
        siteId: site.id,
        deviceIp: ev.deviceIp,
        deviceName: ev.deviceName,
        eventType: ev.eventType,
        major: ev.major,
        minor: ev.minor,
        label: ev.label,
        occurredAt: ev.occurredAt,
        personId: ev.personId,
        personName: ev.personName,
        doorNo: ev.doorNo,
        verifyMode: ev.verifyMode,
        photoPath,
        targets: (ev.targets ?? undefined) as never,
        raw: (ev.raw ?? undefined) as never,
      },
    });

    this.publish(site.id, this.toDto(row));

    // Snapshot de canal siempre en fresco (aunque ya haya cara enrolada):
    // captura el instante en puerta; sustituye photoPath si llega.
    if (worthAPhoto(ev) && isFresh(ev.occurredAt)) {
      void this.attachSnapshotLater(site, row.id, ev);
    }
    return row;
  }

  /** Snapshot ISAPI en segundo plano; re-publica el DTO con foto. */
  private async attachSnapshotLater(
    site: { id: number; companyId: number },
    rowId: number,
    ev: NormalizedEvent,
  ) {
    try {
      const photoPath = await this.snapshot(site, ev);
      if (!photoPath) return;
      const updated = await this.prisma.integraPushEvent.update({
        where: { id: rowId },
        data: { photoPath },
        select: {
          id: true,
          deviceIp: true,
          deviceName: true,
          eventType: true,
          major: true,
          minor: true,
          label: true,
          occurredAt: true,
          personId: true,
          personName: true,
          doorNo: true,
          verifyMode: true,
          photoPath: true,
          targets: true,
        },
      });
      this.publish(site.id, this.toDto(updated));
    } catch (e) {
      this.logger.warn(`Sin foto diferida para ${ev.deviceIp}: ${String(e)}`);
    }
  }

  /**
   * Captura del propio equipo que mandó el evento.
   * Sub-stream `102` primero (más rápido / H.264 bajo); fallback `101`.
   */
  private async snapshot(
    site: { id: number; companyId: number },
    ev: NormalizedEvent,
  ): Promise<string | null> {
    const resolved = await this.sites.resolveClient({
      companyId: site.companyId,
      siteId: site.id,
    });
    if (!resolved.isapiForHost) return null;
    const client = resolved.isapiForHost(ev.deviceIp);
    if (!client) return null;

    for (const ch of ['102', '101']) {
      try {
        const { buffer, contentType } = await client.getBinary(
          `/ISAPI/Streaming/channels/${ch}/picture`,
        );
        if (contentType.includes('image') && buffer.length > 500) {
          return this.savePhoto(site, ev, buffer);
        }
      } catch {
        // probar siguiente canal
      }
    }
    return null;
  }

  private async savePhoto(
    site: { id: number },
    ev: NormalizedEvent,
    buffer: Buffer,
  ): Promise<string> {
    // Un directorio por día: buscar «lo del martes» no debería recorrer un año.
    const day = ev.occurredAt.toISOString().slice(0, 10);
    const safeIp = ev.deviceIp.replace(/[^0-9a-zA-Z.]/g, '_');
    const rel = path.posix.join('integra', String(site.id), day, `${Date.now()}-${safeIp}.jpg`);
    // `resolveUploadsDir`, no `cwd`: en Docker el proceso corre desde
    // `/app/apps/api` y el volumen está montado en `/app/uploads`. Resolver
    // contra el cwd escribe en la capa efímera del contenedor y las fotos
    // desaparecen en el siguiente despliegue.
    const abs = resolveUploadsDir(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return `/uploads/${rel}`;
  }
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function acsOutcome(
  major: number | null,
  minor: number | null,
): 'granted' | 'denied' | null {
  if (major !== 5 || minor == null) return null;
  if (GRANTED_MINORS.includes(minor)) return 'granted';
  if (DENIED_MINORS.includes(minor)) return 'denied';
  return null;
}

function publicBase(): string {
  return (process.env.PUBLIC_API_URL || 'https://integra.nexara.com.mx').replace(/\/$/, '');
}

/**
 * `major 5 / minor 75` es acceso concedido; los `linedetection` y
 * `fielddetection` de la cámara ya vienen filtrados a persona por el propio
 * equipo. Lo demás —latidos, videoloss, puerta abierta por botón— no.
 */
function worthAPhoto(ev: NormalizedEvent): boolean {
  if (ev.eventType === 'AccessControllerEvent') return ev.major === 5;
  return ['linedetection', 'fielddetection', 'facedetection'].includes(ev.eventType);
}

/**
 * Solo se fotografía lo que acaba de pasar.
 *
 * Un equipo al que se le acaba de dar un host de notificación **vuelca todo su
 * historial** —se vieron eventos de hace tres meses entrando de golpe—, y a
 * cada uno se le estaba pegando una foto tomada en ese instante: el pasillo de
 * hoy con el nombre de quien entró en mayo. Parece un registro correcto y no lo
 * es, que es la peor forma de estar mal.
 *
 * El margen es amplio a propósito: la hora del equipo puede ir algo corrida
 * respecto a la del servidor, y perder la foto de una entrada real por unos
 * segundos de deriva sale más caro que tolerarlos.
 */
const PHOTO_MAX_AGE_MS = 20_000;

function isFresh(occurredAt: Date): boolean {
  const age = Date.now() - occurredAt.getTime();
  return age < PHOTO_MAX_AGE_MS && age > -PHOTO_MAX_AGE_MS;
}

function describeErr(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
}

/** Día natural en la zona del sitio, no en UTC. */
function dayIn(d: Date, tz: string): string {
  // `en-CA` da exactamente `YYYY-MM-DD`, que es lo que hace falta para ordenar.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
