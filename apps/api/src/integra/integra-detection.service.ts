import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  APPENDIX_B_EVENT_TYPES,
  DEFAULT_SENSITIVITY,
  MAX_DETECTION_REGIONS,
  SMART_EVENT_TYPES,
  clampSensitivity,
  enableMaxSmartDetection,
  isAlarmConfidence,
  isDetectionTarget,
  probeSmartCapabilities,
  resolveTriggerEventTypes,
  resolveTuning,
  sanitizeRegions,
  supportedEventTypesFrom,
  type AlarmConfidence,
  type DetectionTarget,
  type DetectionTuning,
  type HikvisionIsapiClient,
  type NormalizedRegion,
  type SmartCapabilities,
} from '../hikvision-isapi';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegraSiteService } from './integra-site.service';

/**
 * Perfil de detección por cámara: leerlo, editarlo, aplicarlo al equipo y
 * preguntarle al equipo qué sabe hacer.
 *
 * El problema que resuelve: hasta ahora la detección no estaba parametrizada.
 * `enableFieldDetection` escribía siempre lo mismo —fotograma completo,
 * `sensitivityLevel` 100— en las dieciséis cámaras. Ahora cada una puede tener
 * su zona, su sensibilidad y su lista de eventos, y la que no tenga perfil se
 * configura con la plantilla de compatibilidad de siempre.
 *
 * Lo que se escribe al equipo pasa por `isapi.detection.ts`, que solo toca tags
 * que el propio equipo devolvió. Aquí no se construye XML a mano.
 */

/** Cómo queda un perfil una vez rellenados los huecos. */
export type DetectionProfileDto = {
  cameraId: string;
  cameraName: string | null;
  siteId: number;
  deviceIp: string | null;
  channel: number | null;
  enabled: boolean;
  /** Lo que hay guardado, tal cual (null = nunca se editó). */
  stored: {
    sensitivity: number | null;
    alarmConfidence: string | null;
    detectionTarget: string | null;
    regions: NormalizedRegion[] | null;
    eventTypes: string[] | null;
    timeThresholdSec: number | null;
    minTargetPct: number | null;
    schedule: unknown;
  } | null;
  /** Lo que se le escribiría HOY al equipo, con los defaults ya aplicados. */
  effective: {
    sensitivity: number;
    alarmConfidence: AlarmConfidence;
    detectionTarget: DetectionTarget;
    /** `null` = fotograma completo (comportamiento de compatibilidad). */
    regions: NormalizedRegion[] | null;
    timeThresholdSec: number;
    /** Lista blanca real de `/ISAPI/Event/triggers` para esta cámara. */
    eventTypes: string[];
  };
  lastAppliedAt: string | null;
  lastAppliedNote: string | null;
  /** Qué dijo el equipo la última vez que se le preguntó. `null` = nunca. */
  capabilities: CameraCapabilityDto | null;
  /** Rangos y catálogos para que la UI no invente valores. */
  limits: {
    sensitivityMin: number;
    sensitivityMax: number;
    sensitivityDefault: number;
    maxRegions: number;
    alarmConfidences: readonly string[];
    detectionTargets: readonly string[];
    baseEventTypes: readonly string[];
    catalogEventTypes: readonly string[];
  };
};

export type CameraCapabilityDto = {
  probeOk: boolean;
  probeNote: string | null;
  probedAt: string;
  /** true/false = el equipo lo dijo · null = NO lo dijo (≠ no soportado). */
  flags: Record<string, boolean | null>;
  supportedEventTypes: string[];
  extra: Record<string, boolean>;
};

/** Cambios admitidos en un PATCH. `null` explícito = volver al default. */
export type DetectionProfilePatch = {
  enabled?: boolean;
  sensitivity?: number | null;
  alarmConfidence?: string | null;
  detectionTarget?: string | null;
  regions?: unknown;
  eventTypes?: unknown;
  timeThresholdSec?: number | null;
  minTargetPct?: number | null;
  schedule?: unknown;
  channel?: number | null;
  deviceIp?: string | null;
};

type CameraRaw = {
  channelId?: string;
  streamId?: string;
  source?: { ipAddress?: string | null; reachableDirectly?: boolean } | null;
};

@Injectable()
export class IntegraDetectionService {
  private readonly logger = new Logger(IntegraDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: IntegraSiteService,
  ) {}

  /* ── Resolución de cámara ─────────────────────────────────────────── */

  /**
   * Cámara del espejo + cliente ISAPI apuntando a SU IP.
   *
   * Misma regla que PTZ y audio: se le habla a la IP LAN de la cámara y no al
   * NVR, aunque `reachableDirectly` venga mal marcado en el espejo. Las que
   * cuelgan del PoE interno (`192.168.254.x`) no existen en la LAN: esas se
   * configuran por el grabador, con su canal.
   */
  private async resolveCamera(companyId: number | null, cameraId: string, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.siteId || !resolved.companyId) {
      throw new BadRequestException('La detección solo se configura en sitios ISAPI');
    }
    const camera = await this.prisma.integraCamera.findUnique({
      where: { siteId_cameraIndexCode: { siteId: resolved.siteId, cameraIndexCode: cameraId } },
      select: { raw: true, name: true },
    });
    if (!camera) throw new NotFoundException(`Cámara ${cameraId} no está en el espejo`);

    const raw = (camera.raw ?? {}) as CameraRaw;
    const channelId = raw.channelId ?? null;
    const channel = channelId && /^\d+$/.test(channelId)
      ? Math.max(1, Math.floor(Number(channelId) / (channelId.length >= 3 ? 100 : 1)))
      : 1;

    const ip = raw.source?.ipAddress ?? null;
    const directIp =
      ip && (raw.source?.reachableDirectly || !String(ip).startsWith('192.168.254.')) ? ip : null;
    const client: HikvisionIsapiClient | null =
      directIp && resolved.isapiForHost ? resolved.isapiForHost(directIp) : resolved.isapi;
    if (!client) throw new BadRequestException('Cliente ISAPI no disponible');

    return {
      siteId: resolved.siteId,
      companyId: resolved.companyId,
      cameraName: camera.name,
      // Contra la cámara directa el canal siempre es el 1; contra el grabador,
      // el canal físico que ocupa en él.
      channel: directIp ? 1 : channel,
      deviceIp: directIp ?? resolved.host.replace(/^https?:\/\//, '').split(':')[0],
      client,
    };
  }

  /* ── Lectura ──────────────────────────────────────────────────────── */

  /** Perfil + capacidades + lo que se le escribiría hoy al equipo. */
  async getProfile(
    companyId: number | null,
    cameraId: string,
    siteId?: number | null,
  ): Promise<DetectionProfileDto> {
    const cam = await this.resolveCamera(companyId, cameraId, siteId);
    const [row, caps] = await Promise.all([
      this.prisma.integraDetectionProfile.findUnique({
        where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
      }),
      this.prisma.integraCameraCapability.findUnique({
        where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
      }),
    ]);

    const regions = sanitizeRegions(row?.regions ?? null);
    const eventTypes = toStringArray(row?.eventTypes);
    const tuning = this.toTuning(row);
    const effective = resolveTuning(tuning);

    return {
      cameraId,
      cameraName: cam.cameraName,
      siteId: cam.siteId,
      deviceIp: row?.deviceIp ?? cam.deviceIp,
      channel: row?.channel ?? cam.channel,
      enabled: row?.enabled ?? true,
      stored: row
        ? {
            sensitivity: row.sensitivity,
            alarmConfidence: row.alarmConfidence,
            detectionTarget: row.detectionTarget,
            regions,
            eventTypes: eventTypes.length ? eventTypes : null,
            timeThresholdSec: row.timeThresholdSec,
            minTargetPct: row.minTargetPct,
            schedule: row.schedule ?? null,
          }
        : null,
      effective: {
        sensitivity: effective.sensitivity,
        alarmConfidence: effective.alarmConfidence,
        detectionTarget: effective.target,
        regions: effective.regions,
        timeThresholdSec: effective.timeThresholdSec,
        eventTypes: resolveTriggerEventTypes(eventTypes),
      },
      lastAppliedAt: row?.lastAppliedAt ? row.lastAppliedAt.toISOString() : null,
      lastAppliedNote: row?.lastAppliedNote ?? null,
      capabilities: caps ? capabilityDto(caps) : null,
      limits: {
        sensitivityMin: 0,
        sensitivityMax: 100,
        sensitivityDefault: DEFAULT_SENSITIVITY,
        maxRegions: MAX_DETECTION_REGIONS,
        alarmConfidences: ['low', 'mediumLow', 'mediumHigh', 'high'],
        detectionTargets: ['human', 'vehicle', 'human,vehicle'],
        baseEventTypes: SMART_EVENT_TYPES,
        catalogEventTypes: APPENDIX_B_EVENT_TYPES,
      },
    };
  }

  /** Fila de la base → tuning para `isapi.detection.ts`. */
  private toTuning(row: {
    sensitivity: number | null;
    alarmConfidence: string | null;
    detectionTarget: string | null;
    regions: unknown;
    timeThresholdSec: number | null;
  } | null): DetectionTuning | null {
    if (!row) return null;
    return {
      target: isDetectionTarget(row.detectionTarget) ? row.detectionTarget : null,
      sensitivity: row.sensitivity,
      alarmConfidence: isAlarmConfidence(row.alarmConfidence) ? row.alarmConfidence : null,
      regions: sanitizeRegions(row.regions),
      timeThresholdSec: row.timeThresholdSec,
    };
  }

  /* ── Escritura del perfil (no toca el equipo) ─────────────────────── */

  /**
   * Guarda el perfil. **No** escribe en la cámara: eso es `applyProfile`, para
   * que editar en la consola no dispare tráfico ISAPI en cada tecla.
   *
   * Todo lo que no case con los enums documentados se rechaza con 400 en vez de
   * guardarse: un `alarmConfidence` inventado acabaría en el XML del equipo.
   */
  async updateProfile(
    companyId: number | null,
    cameraId: string,
    patch: DetectionProfilePatch,
    siteId?: number | null,
  ): Promise<DetectionProfileDto> {
    const cam = await this.resolveCamera(companyId, cameraId, siteId);

    const data: Record<string, unknown> = {};

    if (patch.enabled !== undefined) data.enabled = patch.enabled !== false;

    if (patch.sensitivity !== undefined) {
      data.sensitivity =
        patch.sensitivity === null ? null : clampSensitivity(patch.sensitivity);
    }

    if (patch.alarmConfidence !== undefined) {
      if (patch.alarmConfidence === null) data.alarmConfidence = null;
      else if (isAlarmConfidence(patch.alarmConfidence)) {
        data.alarmConfidence = patch.alarmConfidence;
      } else {
        throw new BadRequestException(
          'alarmConfidence debe ser low | mediumLow | mediumHigh | high',
        );
      }
    }

    if (patch.detectionTarget !== undefined) {
      if (patch.detectionTarget === null) data.detectionTarget = null;
      else if (isDetectionTarget(patch.detectionTarget)) {
        data.detectionTarget = patch.detectionTarget;
      } else {
        throw new BadRequestException('detectionTarget debe ser human | vehicle | human,vehicle');
      }
    }

    if (patch.regions !== undefined) {
      if (patch.regions === null) data.regions = null;
      else {
        const regions = sanitizeRegions(patch.regions);
        if (!regions) {
          throw new BadRequestException(
            `regions debe traer entre 1 y ${MAX_DETECTION_REGIONS} polígonos de 3+ vértices en 0..1`,
          );
        }
        data.regions = regions;
      }
    }

    if (patch.eventTypes !== undefined) {
      if (patch.eventTypes === null) data.eventTypes = null;
      else {
        const wanted = toStringArray(patch.eventTypes);
        // Solo lo que amplía la base; lo que ya está en ella sobra en la fila.
        const extra = resolveTriggerEventTypes(wanted).filter(
          (t) => !(SMART_EVENT_TYPES as readonly string[]).includes(t),
        );
        const rechazados = wanted.filter(
          (w) =>
            !APPENDIX_B_EVENT_TYPES.some((t) => t.toLowerCase() === w.toLowerCase()),
        );
        if (rechazados.length) {
          throw new BadRequestException(
            `eventTypes fuera del catálogo documentado (Apéndice B): ${rechazados.join(', ')}`,
          );
        }
        data.eventTypes = extra;
      }
    }

    if (patch.timeThresholdSec !== undefined) {
      data.timeThresholdSec =
        patch.timeThresholdSec === null
          ? null
          : Math.max(0, Math.min(3600, Math.round(Number(patch.timeThresholdSec) || 0)));
    }

    if (patch.minTargetPct !== undefined) {
      if (patch.minTargetPct === null) data.minTargetPct = null;
      else {
        const n = Number(patch.minTargetPct);
        if (!Number.isFinite(n) || n < 0 || n > 1) {
          throw new BadRequestException('minTargetPct debe estar entre 0 y 1');
        }
        data.minTargetPct = n;
      }
    }

    if (patch.schedule !== undefined) data.schedule = patch.schedule ?? null;
    if (patch.channel !== undefined) {
      data.channel = patch.channel === null ? null : Math.max(1, Math.round(patch.channel));
    }
    if (patch.deviceIp !== undefined) data.deviceIp = patch.deviceIp?.trim() || null;

    await this.prisma.integraDetectionProfile.upsert({
      where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
      create: {
        companyId: cam.companyId,
        siteId: cam.siteId,
        cameraId,
        deviceIp: cam.deviceIp,
        channel: cam.channel,
        ...data,
      } as never,
      update: data as never,
    });

    return this.getProfile(companyId, cameraId, siteId);
  }

  /* ── Escritura en el equipo ───────────────────────────────────────── */

  /**
   * Escribe el perfil en la cámara: FieldDetection + LineDetection + FaceDetect
   * + motion + la lista blanca de `/ISAPI/Event/triggers`.
   *
   * Un perfil `enabled=false` no se aplica: se responde sin tocar el equipo.
   */
  async applyProfile(
    companyId: number | null,
    cameraId: string,
    siteId?: number | null,
  ): Promise<{
    cameraId: string;
    applied: boolean;
    note: string;
    report: Awaited<ReturnType<typeof enableMaxSmartDetection>> | null;
    effective: DetectionProfileDto['effective'];
  }> {
    const cam = await this.resolveCamera(companyId, cameraId, siteId);
    const profile = await this.getProfile(companyId, cameraId, siteId);

    if (!profile.enabled) {
      return {
        cameraId,
        applied: false,
        note: 'Perfil apagado: no se ha tocado el equipo.',
        report: null,
        effective: profile.effective,
      };
    }

    const row = await this.prisma.integraDetectionProfile.findUnique({
      where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
    });
    const tuning = this.toTuning(row);
    const channel = profile.channel ?? cam.channel;

    let note: string;
    let report: Awaited<ReturnType<typeof enableMaxSmartDetection>> | null = null;
    try {
      report = await enableMaxSmartDetection(cam.client, {
        channel,
        fieldTarget: profile.effective.detectionTarget === 'vehicle'
          ? 'human,vehicle'
          : (profile.effective.detectionTarget as 'human' | 'human,vehicle'),
        tuning,
        extraEventTypes: toStringArray(row?.eventTypes),
      });
      note = report.field
        ? `fd=${report.field}/ln=${report.line}/fc=${report.face}/md=${report.motion}/tr=${report.triggers}`
        : 'El equipo no admite FieldDetection en ese canal';
    } catch (e) {
      note = e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400);
    }

    await this.prisma.integraDetectionProfile.upsert({
      where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
      create: {
        companyId: cam.companyId,
        siteId: cam.siteId,
        cameraId,
        deviceIp: cam.deviceIp,
        channel,
        lastAppliedAt: new Date(),
        lastAppliedNote: note,
      },
      update: { lastAppliedAt: new Date(), lastAppliedNote: note },
    });

    return {
      cameraId,
      applied: Boolean(report?.field),
      note,
      report,
      effective: profile.effective,
    };
  }

  /* ── Capacidades ──────────────────────────────────────────────────── */

  /**
   * Pregunta a la cámara qué sabe hacer y lo guarda en columnas reales.
   *
   * `GET /ISAPI/Smart/capabilities` no se llamaba desde ningún punto del
   * código. Sin esto se planifica a ciegas: un `null` en un flag significa «el
   * equipo no lo declara», que no es lo mismo que «no lo soporta». La fila se
   * guarda incluso cuando el equipo no contesta (`probeOk=false`), porque «esta
   * cámara responde 403 a capabilities» también es un hecho que hay que anotar.
   */
  async probeCapabilities(
    companyId: number | null,
    cameraId: string,
    siteId?: number | null,
  ): Promise<CameraCapabilityDto> {
    const cam = await this.resolveCamera(companyId, cameraId, siteId);

    let caps: SmartCapabilities | null = null;
    let note: string | null = null;
    try {
      const probe = await probeSmartCapabilities(cam.client, cam.channel);
      if (probe) caps = probe.caps;
      else note = 'El equipo no respondió a /ISAPI/Smart/capabilities (403/404 o sin flags)';
    } catch (e) {
      note = e instanceof Error ? e.message.slice(0, 280) : String(e).slice(0, 280);
    }

    const row = await this.prisma.integraCameraCapability.upsert({
      where: { siteId_cameraId: { siteId: cam.siteId, cameraId } },
      create: {
        companyId: cam.companyId,
        siteId: cam.siteId,
        cameraId,
        deviceIp: cam.deviceIp,
        channel: cam.channel,
        ...capabilityColumns(caps),
        probeOk: caps !== null,
        probeNote: note,
        probedAt: new Date(),
      },
      update: {
        deviceIp: cam.deviceIp,
        channel: cam.channel,
        ...capabilityColumns(caps),
        probeOk: caps !== null,
        probeNote: note,
        probedAt: new Date(),
      },
    });

    return capabilityDto(row);
  }

  /**
   * Sondea TODAS las cámaras ISAPI del sitio, una a una.
   *
   * En serie a propósito: el parque va por Tailscale con 87 ms de RTT y un
   * abanico de dieciséis peticiones simultáneas es justo lo que satura al NVR.
   */
  async probeSiteCapabilities(
    companyId: number | null,
    siteId?: number | null,
  ): Promise<{
    siteId: number;
    total: number;
    ok: number;
    items: Array<{ cameraId: string; name: string | null; probeOk: boolean; note: string | null }>;
  }> {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (resolved.provider !== 'ISAPI' || !resolved.siteId) {
      throw new BadRequestException('El sondeo de capacidades solo aplica a sitios ISAPI');
    }
    const cameras = await this.prisma.integraCamera.findMany({
      where: { siteId: resolved.siteId },
      select: { cameraIndexCode: true, name: true },
      orderBy: { cameraIndexCode: 'asc' },
    });

    const items: Array<{
      cameraId: string;
      name: string | null;
      probeOk: boolean;
      note: string | null;
    }> = [];
    for (const cam of cameras) {
      try {
        const dto = await this.probeCapabilities(companyId, cam.cameraIndexCode, resolved.siteId);
        items.push({
          cameraId: cam.cameraIndexCode,
          name: cam.name,
          probeOk: dto.probeOk,
          note: dto.probeNote,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 280) : String(e).slice(0, 280);
        this.logger.warn(`Capabilities ${cam.cameraIndexCode}: ${msg}`);
        items.push({ cameraId: cam.cameraIndexCode, name: cam.name, probeOk: false, note: msg });
      }
    }

    return {
      siteId: resolved.siteId,
      total: items.length,
      ok: items.filter((i) => i.probeOk).length,
      items,
    };
  }

  /** Lo que el sitio entero declara soportar, ya sondeado. */
  async listCapabilities(companyId: number | null, siteId?: number | null) {
    const resolved = await this.sites.resolveClient({ companyId, siteId });
    if (!resolved.siteId) throw new BadRequestException('Sitio requerido');
    const rows = await this.prisma.integraCameraCapability.findMany({
      where: { siteId: resolved.siteId },
      orderBy: { cameraId: 'asc' },
    });
    return {
      siteId: resolved.siteId,
      items: rows.map((r) => ({ cameraId: r.cameraId, ...capabilityDto(r) })),
    };
  }
}

/* ── Helpers de módulo ───────────────────────────────────────────────── */

/** `Json` de la base o cuerpo de un PATCH → cadenas limpias. */
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x): x is string => x.length > 0);
}

/** `SmartCapabilities` → columnas de `integra_camera_capabilities`. */
function capabilityColumns(caps: SmartCapabilities | null) {
  return {
    fieldDetection: caps?.fieldDetection ?? null,
    lineDetection: caps?.lineDetection ?? null,
    faceDetect: caps?.faceDetect ?? null,
    regionEntrance: caps?.regionEntrance ?? null,
    regionExiting: caps?.regionExiting ?? null,
    loitering: caps?.loitering ?? null,
    unattendedBaggage: caps?.unattendedBaggage ?? null,
    attendedBaggage: caps?.attendedBaggage ?? null,
    peopleGathering: caps?.group ?? null,
    defocus: caps?.defocus ?? null,
    sceneChange: caps?.sceneChange ?? null,
    audioException: caps?.audioException ?? null,
    peopleCounting: caps?.peopleCounting ?? null,
    heatMap: caps?.heatMap ?? null,
    supportedEventTypes: (caps ? supportedEventTypesFrom(caps) : []) as never,
    extra: (caps?.extra ?? {}) as never,
  };
}

/** Fila → DTO. Los `null` se conservan: son «el equipo no lo dijo». */
function capabilityDto(row: {
  probeOk: boolean;
  probeNote: string | null;
  probedAt: Date;
  fieldDetection: boolean | null;
  lineDetection: boolean | null;
  faceDetect: boolean | null;
  regionEntrance: boolean | null;
  regionExiting: boolean | null;
  loitering: boolean | null;
  unattendedBaggage: boolean | null;
  attendedBaggage: boolean | null;
  peopleGathering: boolean | null;
  defocus: boolean | null;
  sceneChange: boolean | null;
  audioException: boolean | null;
  peopleCounting: boolean | null;
  heatMap: boolean | null;
  supportedEventTypes: unknown;
  extra: unknown;
}): CameraCapabilityDto {
  return {
    probeOk: row.probeOk,
    probeNote: row.probeNote,
    probedAt: row.probedAt.toISOString(),
    flags: {
      fieldDetection: row.fieldDetection,
      lineDetection: row.lineDetection,
      faceDetect: row.faceDetect,
      regionEntrance: row.regionEntrance,
      regionExiting: row.regionExiting,
      loitering: row.loitering,
      unattendedBaggage: row.unattendedBaggage,
      attendedBaggage: row.attendedBaggage,
      peopleGathering: row.peopleGathering,
      defocus: row.defocus,
      sceneChange: row.sceneChange,
      audioException: row.audioException,
      peopleCounting: row.peopleCounting,
      heatMap: row.heatMap,
    },
    supportedEventTypes: toStringArray(row.supportedEventTypes),
    extra:
      row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra)
        ? (row.extra as Record<string, boolean>)
        : {},
  };
}
