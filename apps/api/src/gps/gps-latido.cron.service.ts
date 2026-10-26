import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushDispatchService } from '../devices/push-dispatch.service.js';
import { workDateColumn, workDateKey, workDayBounds } from '../common/time/workday.js';
import {
  horaCortaMexico,
  necesitaLatido,
  plataformaDeOrigen,
} from './cadencia-jornada.js';

/**
 * Latido del GPS de jornada.
 *
 * Cada 5 minutos: a quien tiene la jornada abierta, comparte su ubicación y lleva más de 35 min
 * sin un punto, el servidor le pide uno al teléfono (ver `PushDispatchService.sendGpsLatido`).
 *
 * Es la segunda vía de la regla de Adam (un punto cada 30 min con la app cerrada): la primera es
 * la alarma de la propia app. Android puede retrasar o tirar esa alarma (fabricantes que cierran
 * apps, reposo profundo); un push de datos de prioridad alta llega igual.
 *
 * El registro de latidos vive en memoria: si el API se reinicia, a lo más se repite uno.
 */
@Injectable()
export class GpsLatidoCronService {
  private readonly logger = new Logger(GpsLatidoCronService.name);
  /** `userId:día` → último latido enviado. */
  private readonly ultimos = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushDispatchService,
  ) {}

  @Cron('*/5 * * * *', { name: 'gps-latido-jornada' })
  async revisar(): Promise<void> {
    try {
      const enviados = await this.revisarAhora(new Date());
      if (enviados) this.logger.log(`Latidos de GPS enviados: ${enviados}`);
    } catch (error) {
      this.logger.warn(`Latido de GPS falló: ${(error as Error).message}`);
    }
  }

  /** Separado del cron para probarlo con una hora fija. Devuelve cuántas personas recibieron latido. */
  async revisarAhora(ahora: Date): Promise<number> {
    if (!this.push) return 0;
    const hoy = workDateColumn(ahora);
    const diaKey = workDateKey(ahora);
    const { start } = workDayBounds(ahora);

    const dias = await this.prisma.attendanceDay.findMany({
      where: { date: hoy, isOpen: true, lastEntryAt: { not: null }, user: { locationConsent: true } },
      select: { userId: true, companyId: true, lastEntryAt: true },
    });
    if (!dias.length) return 0;
    const ids = dias.map((d) => d.userId);

    const [puntos, entradas] = await Promise.all([
      this.prisma.locationTracking.groupBy({
        by: ['usuarioId'],
        where: { usuarioId: { in: ids }, ultimaActualizacion: { gte: start } },
        _max: { ultimaActualizacion: true },
      }),
      this.prisma.attendance.findMany({
        where: { userId: { in: ids }, type: 'entrada', workDate: hoy },
        select: { userId: true, origen: true },
      }),
    ]);
    const ultimoPunto = new Map(puntos.map((p) => [p.usuarioId, p._max.ultimaActualizacion ?? null]));
    const origen = new Map(entradas.map((e) => [e.userId, e.origen]));

    let enviados = 0;
    for (const dia of dias) {
      const entradaAt = dia.lastEntryAt!;
      const plataforma = plataformaDeOrigen(origen.get(dia.userId));
      const clave = `${dia.userId}:${diaKey}`;
      const punto = ultimoPunto.get(dia.userId) ?? null;
      if (
        !necesitaLatido({
          ahora,
          entradaAt,
          ultimoPuntoAt: punto,
          ultimoLatidoAt: this.ultimos.get(clave) ?? null,
          plataforma,
        })
      ) {
        continue;
      }
      const desde = punto && punto > entradaAt ? punto : entradaAt;
      const recordatorio =
        plataforma === 'IOS'
          ? {
              title: 'Tu jornada sigue abierta',
              body: `No tenemos tu ubicación desde las ${horaCortaMexico(desde)}. Abre NEXARA un momento para registrarla.`,
            }
          : null;
      this.ultimos.set(clave, ahora);
      const n = await this.push.sendGpsLatido(dia.userId, recordatorio).catch(() => 0);
      if (n > 0) enviados += 1;
    }
    // Lo de días anteriores ya no sirve.
    for (const clave of this.ultimos.keys()) {
      if (!clave.endsWith(`:${diaKey}`)) this.ultimos.delete(clave);
    }
    return enviados;
  }
}
