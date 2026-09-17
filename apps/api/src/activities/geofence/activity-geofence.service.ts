import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationHierarchyService } from '../../notifications/notification-hierarchy.service.js';
import { saveBase64Photo } from '../../common/file-upload.util';
import { RADIO_ACTIVIDAD_M, distanciaM, mensajeSalidaFueraDeZona, puntoReal, type Punto } from './geocerca';
import { puedeVerGpsDireccion } from '../../attendance/asistencia-confiable.js';

/** Estatus de actividad que ya no se siguen. */
const CERRADAS = ['Finalizada', 'Cancelada', 'Completada'];

type AlertaFila = {
  id: number;
  detectedAt: Date;
  returnedAt: Date | null;
  distanceM: number;
  maxDistanceM: number;
  radiusM: number;
  status: string;
  justification: string | null;
  justificationPhotoUrl: string | null;
  justifiedAt: Date | null;
  latitude: unknown;
  longitude: unknown;
};

export function alertaDto(a: AlertaFila) {
  return {
    id: a.id,
    detectedAt: a.detectedAt,
    returnedAt: a.returnedAt,
    distanciaM: a.distanceM,
    maxDistanciaM: a.maxDistanceM,
    radioM: a.radiusM,
    status: a.status,
    abierta: a.returnedAt == null,
    justificacion: a.justification,
    fotoUrl: a.justificationPhotoUrl,
    justificadaAt: a.justifiedAt,
    latitude: Number(a.latitude),
    longitude: Number(a.longitude),
  };
}

/**
 * Geocerca de actividades (100 m alrededor de la foto de entrada):
 * - cada punto GPS de quien tiene una actividad iniciada se mide contra su punto de inicio;
 * - al salir del radio se abre una alerta y se avisa por push a la persona, sus jefes,
 *   el responsable/encargados de la actividad y Christian;
 * - la foto de salida no se acepta fuera del radio;
 * - la persona puede justificar la salida con motivo y foto.
 */
@Injectable()
export class ActivityGeofenceService {
  private readonly logger = new Logger(ActivityGeofenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  /** Punto de inicio de esa persona en esa actividad (foto de entrada), si lo hay. */
  async origen(activityId: number, userId: number) {
    const e = await this.prisma.activityEvidence.findUnique({
      where: { activityId_userId: { activityId, userId } },
      select: {
        entryLatitude: true,
        entryLongitude: true,
        entryPhotoUploadedAt: true,
        exitPhotoUploadedAt: true,
        status: true,
        companyId: true,
      },
    });
    if (!e) return null;
    const punto = puntoReal(e.entryLatitude, e.entryLongitude);
    if (!punto) return null;
    return { punto, at: e.entryPhotoUploadedAt, salidaAt: e.exitPhotoUploadedAt, status: e.status, companyId: e.companyId };
  }

  /** La foto de salida solo se acepta dentro del radio del punto de inicio. */
  async validarSalida(activityId: number, userId: number, latitude: number, longitude: number) {
    const o = await this.origen(activityId, userId);
    const punto = puntoReal(latitude, longitude);
    if (!o || !punto) return; // sin punto de inicio (evidencias viejas) no hay contra qué medir
    const d = distanciaM(o.punto, punto);
    if (d > RADIO_ACTIVIDAD_M) {
      throw new BadRequestException(mensajeSalidaFueraDeZona(d));
    }
  }

  /**
   * Mide un punto GPS contra las actividades iniciadas de la persona. Nunca lanza: lo llama el
   * registro de ubicación y un fallo aquí no debe perder el punto.
   */
  async evaluarPunto(params: { userId: number; latitude: number; longitude: number; actividadId?: number | null }) {
    const punto = puntoReal(params.latitude, params.longitude);
    if (!punto) return;
    try {
      const abiertas = await this.prisma.activityEvidence.findMany({
        where: {
          userId: params.userId,
          status: { notIn: ['ENTRY_PHOTO', 'COMPLETED'] },
          entryLatitude: { not: null },
          entryLongitude: { not: null },
          ...(params.actividadId ? { activityId: params.actividadId } : {}),
          activity: { deletedAt: null, estatus: { notIn: CERRADAS } },
        },
        select: { activityId: true, entryLatitude: true, entryLongitude: true, companyId: true },
      });
      for (const e of abiertas) {
        const origen = puntoReal(e.entryLatitude, e.entryLongitude);
        if (!origen) continue;
        await this.evaluarActividad(e.activityId, params.userId, e.companyId, origen, punto);
      }
    } catch (err) {
      this.logger.warn(`Geocerca: no se pudo evaluar el punto de ${params.userId}: ${(err as Error).message}`);
    }
  }

  private async evaluarActividad(activityId: number, userId: number, companyId: number, origen: Punto, punto: Punto) {
    const d = distanciaM(origen, punto);
    const abierta = await this.prisma.activityGeofenceAlert.findFirst({
      where: { activityId, userId, returnedAt: null },
      orderBy: { detectedAt: 'desc' },
    });
    if (d > RADIO_ACTIVIDAD_M) {
      if (abierta) {
        if (d > abierta.maxDistanceM) {
          await this.prisma.activityGeofenceAlert.update({ where: { id: abierta.id }, data: { maxDistanceM: d } });
        }
        return;
      }
      const alerta = await this.prisma.activityGeofenceAlert.create({
        data: {
          activityId,
          userId,
          companyId,
          originLatitude: origen.lat,
          originLongitude: origen.lng,
          latitude: punto.lat,
          longitude: punto.lng,
          distanceM: d,
          maxDistanceM: d,
          radiusM: RADIO_ACTIVIDAD_M,
        },
      });
      void Promise.resolve(
        this.notificationHierarchy.notifyActivityOutOfZone({ activityId, userId, distanciaM: d, alertId: alerta.id }),
      ).catch(() => undefined);
      return;
    }
    if (abierta) {
      await this.prisma.activityGeofenceAlert.update({ where: { id: abierta.id }, data: { returnedAt: new Date() } });
    }
  }

  /**
   * Lo que ve la persona en su actividad: punto de inicio, alertas y —solo para
   * dirección— el recorrido.
   *
   * `puntos` es telemetría: dónde estuvo alguien minuto a minuto. Las alertas de
   * zona y su justificación siguen visibles para quien las tiene que revisar;
   * el rastro completo se queda en dirección (contrato del viernes 18-09, A).
   */
  async estado(activityId: number, userId: number, viewer?: { email?: string | null } | null) {
    const o = await this.origen(activityId, userId);
    const alertas = await this.prisma.activityGeofenceAlert.findMany({
      where: { activityId, userId },
      orderBy: { detectedAt: 'desc' },
    });
    const verRecorrido = puedeVerGpsDireccion(viewer);
    let puntos: Array<{ latitude: number; longitude: number; at: Date; distanciaM: number | null }> = [];
    if (o?.at) {
      const filas = await this.prisma.locationTracking.findMany({
        where: {
          usuarioId: userId,
          ultimaActualizacion: { gte: o.at, ...(o.salidaAt ? { lte: o.salidaAt } : {}) },
        },
        orderBy: { ultimaActualizacion: 'desc' },
        take: 40,
        select: { latitud: true, longitud: true, ultimaActualizacion: true },
      });
      puntos = filas
        .map((f) => {
          const p = puntoReal(f.latitud, f.longitud);
          if (!p) return null;
          return { latitude: p.lat, longitude: p.lng, at: f.ultimaActualizacion, distanciaM: distanciaM(o.punto, p) };
        })
        .filter((p): p is NonNullable<typeof p> => p != null);
    }
    const ultimo = puntos[0] ?? null;
    return {
      activityId,
      radioM: RADIO_ACTIVIDAD_M,
      origen: o ? { latitude: o.punto.lat, longitude: o.punto.lng, at: o.at } : null,
      seguimientoActivo: Boolean(o && !o.salidaAt && o.status !== 'COMPLETED'),
      dentro: ultimo ? ultimo.distanciaM != null && ultimo.distanciaM <= RADIO_ACTIVIDAD_M : null,
      ultimo,
      // El rastro completo, solo dirección; «dentro/fuera» y las alertas siguen para todos.
      puntos: verRecorrido ? puntos : [],
      alertas: alertas.map(alertaDto),
    };
  }

  /** La persona explica por qué salió del radio (motivo obligatorio, foto opcional pero recomendada). */
  async justificar(params: {
    activityId: number;
    alertId: number;
    userId: number;
    motivo: string;
    fotoBase64?: string | null;
  }) {
    const alerta = await this.prisma.activityGeofenceAlert.findFirst({
      where: { id: params.alertId, activityId: params.activityId },
    });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');
    if (alerta.userId !== params.userId) {
      throw new ForbiddenException('Solo quien salió de la zona puede justificarlo');
    }
    const motivo = (params.motivo ?? '').trim();
    if (motivo.length < 5) {
      throw new BadRequestException('Escribe el motivo (al menos 5 caracteres)');
    }
    let fotoUrl: string | null = alerta.justificationPhotoUrl;
    const foto = params.fotoBase64?.trim();
    if (foto) {
      fotoUrl = saveBase64Photo(foto.startsWith('data:') ? foto : `data:image/jpeg;base64,${foto}`, __dirname, 'activities');
    }
    const actualizada = await this.prisma.activityGeofenceAlert.update({
      where: { id: alerta.id },
      data: { justification: motivo, justificationPhotoUrl: fotoUrl, justifiedAt: new Date(), status: 'JUSTIFICADA' },
    });
    void Promise.resolve(
      this.notificationHierarchy.notifyActivityOutOfZoneJustified({
        activityId: params.activityId,
        userId: params.userId,
        motivo,
        alertId: alerta.id,
      }),
    ).catch(() => undefined);
    return alertaDto(actualizada);
  }
}
