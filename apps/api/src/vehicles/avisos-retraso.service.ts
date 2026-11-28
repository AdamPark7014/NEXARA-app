import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ESTATUS_CERRADOS } from '../activities/rellenar-tiempos.js';
import {
  dentroDeHorario,
  destinatariosAviso,
  motivoRetraso,
  textoAviso,
  tocaAviso,
  type UsoParaAviso,
} from './avisos-retraso.js';
import { capturaGuiadaPrendida } from './interruptor-vehiculos.js';
import { DanosVehiculoService } from './danos-vehiculo.service.js';

/**
 * Avisos repetidos de unidad sin devolver (reglas en `avisos-retraso.ts`). Corre cada 10 minutos en
 * horario de trabajo para que el primer aviso llegue poco después de vencer o de cerrar la actividad;
 * entre dos avisos del mismo uso pasan al menos 55 minutos. Solo con el interruptor prendido.
 */
@Injectable()
export class AvisosRetrasoService {
  private readonly logger = new Logger(AvisosRetrasoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly danos: DanosVehiculoService,
  ) {}

  @Cron('*/10 8-20 * * *', { name: 'vehiculos-avisos-retraso', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('vehiculos-avisos-retraso', this.logger, async () => {
      // El interruptor va DENTRO del trabajo: apagado, la tarea sigue latiendo («ok») y no actúa. Si estuviera
      // antes, nunca dejaría latido y el vigilante la daría por atrasada (falsa alarma).
      if (!(await capturaGuiadaPrendida(this.prisma))) return;
      const r = await this.avisar();
      if (r.avisos) this.logger.log(`Avisos de unidad sin devolver: ${r.avisos} de ${r.revisados} usos fuera`);
    });
  }

  async avisar(ahora: Date = new Date()): Promise<{ revisados: number; avisos: number }> {
    if (!dentroDeHorario(ahora)) return { revisados: 0, avisos: 0 };
    const usos = await this.prisma.vehicleControl.findMany({
      where: { estatusAprobacion: 'Aprobado', entregaEstatus: 'En uso' },
      orderBy: { id: 'asc' },
      take: 500,
      select: {
        id: true,
        companyId: true,
        vehicleId: true,
        solicitanteId: true,
        encargadoId: true,
        fechaFinAprobada: true,
        fechaFinSolicitada: true,
        avisosRetraso: true,
        ultimoAvisoRetrasoEn: true,
        nombreVehiculo: true,
        vehiculo: { select: { nombre: true } },
        actividad: { select: { estatus: true } },
        solicitante: { select: { id: true, nombre: true, managerId: true } },
        encargado: { select: { id: true, nombre: true, managerId: true } },
      },
    });

    let avisos = 0;
    for (const u of usos) {
      const uso: UsoParaAviso = {
        solicitanteId: u.solicitanteId,
        encargadoId: u.encargadoId,
        fechaFinAprobada: u.fechaFinAprobada,
        fechaFinSolicitada: u.fechaFinSolicitada,
        actividadCerrada: ESTATUS_CERRADOS.includes(u.actividad?.estatus ?? ''),
        avisosRetraso: u.avisosRetraso ?? 0,
        ultimoAvisoRetrasoEn: u.ultimoAvisoRetrasoEn,
      };
      const retraso = motivoRetraso(uso, ahora);
      if (!retraso || !tocaAviso(uso, ahora)) continue;

      // Se aparta el aviso antes de mandarlo: si dos procesos corren a la vez, solo uno avisa.
      const d = destinatariosAviso(uso);
      const apartado = await this.prisma.vehicleControl.updateMany({
        where: { id: u.id, avisosRetraso: uso.avisosRetraso },
        data: { avisosRetraso: d.numero, ultimoAvisoRetrasoEn: ahora },
      });
      if (!apartado.count) continue;

      const persona = u.encargado ?? u.solicitante;
      const unidad = u.vehiculo?.nombre ?? u.nombreVehiculo ?? 'la unidad';
      const texto = textoAviso(unidad, retraso, persona?.nombre ?? 'Quien trae la unidad');
      const mandar = (userId: number, mensaje: string, relatedUrl: string) =>
        this.notifications.createNotification({
          userId,
          type: 'VEHICLE_USAGE_OVERDUE',
          category: 'vehicles',
          title: texto.titulo,
          message: mensaje,
          relatedEntityId: u.id,
          entityType: 'VehicleControl',
          relatedUrl,
          priority: 'high',
          companyId: u.companyId,
          dedupeSeconds: 0,
        });

      const ficha = u.vehicleId ? `/erp/vehiculos/${u.vehicleId}` : '/erp/vehiculos';
      await mandar(d.personaId, texto.paraPersona, '/erp/vehiculos/mis-vehiculos');
      if (d.liz) {
        for (const g of await this.danos.gestoras(u.companyId)) {
          if (g.id !== d.personaId) await mandar(g.id, texto.paraSupervision, ficha);
        }
      }
      const jefeId = persona?.managerId ?? null;
      if (d.jefe && jefeId && jefeId !== d.personaId) await mandar(jefeId, texto.paraSupervision, ficha);
      avisos++;
    }
    return { revisados: usos.length, avisos };
  }
}
