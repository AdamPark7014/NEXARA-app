import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE, workDateKey } from '../common/time/workday.js';
import { numero } from './calculos/numeros.js';
import { KM_VIAJE_SOSPECHOSO, kmDeSalida } from './calculos/vehiculo.js';
import {
  conservarTarifaDeViaje,
  gasolinaYaEnKm,
  movimientoDeGasto,
  movimientoDeSalida,
  movimientoDeViaje,
  movimientosDeSesiones,
  movimientosDeViatico,
  type MovimientoCalculado,
} from './calculos/libro-costos.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { VehiculosMotorService } from './vehiculos/vehiculos-motor.service.js';

export type ResultadoLibro = { creados: number; actualizados: number; borrados: number; total: number };

const fechaColumna = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);

/** Un renglón guardado es igual al calculado: no hay nada que escribir. */
function igual(g: Record<string, any>, m: MovimientoCalculado): boolean {
  return (
    g.rubro === m.rubro &&
    g.activityId === m.activityId &&
    (g.userId ?? null) === m.userId &&
    new Date(g.fecha).toISOString().slice(0, 10) === m.fecha &&
    numero(g.cantidad) === m.cantidad &&
    numero(g.costoUnitario) === m.costoUnitario &&
    numero(g.importe) === m.importe &&
    (g.nota ?? null) === m.nota
  );
}

/**
 * Mantiene el libro al día. Corre de noche y a pedido, y se puede repetir sin duplicar: compara lo
 * que debería haber contra lo que hay. Lo CERRADO no se toca.
 */
@Injectable()
export class LibroCostosService {
  private readonly logger = new Logger('LibroCostos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tarifas: CostosTarifasService,
    private readonly vehiculos: VehiculosMotorService,
  ) {}

  @Cron('20 3 * * *', { name: 'costos-libro', timeZone: WORKDAY_TIMEZONE })
  async nocturno() {
    await runScheduledJob('costos:libro', this.logger, () => this.sincronizarTodas());
  }

  async sincronizarTodas(): Promise<void> {
    const empresas = await this.prisma.activityWorkSession.findMany({
      distinct: ['companyId'],
      select: { companyId: true },
    });
    for (const { companyId } of empresas) {
      const r = await this.sincronizar(companyId);
      this.logger.log(`Empresa ${companyId}: ${r.creados} nuevos, ${r.actualizados} cambiados, ${r.borrados} borrados`);
    }
  }

  /** Lo que el libro debería tener, leído de la operación. */
  async calcular(companyId: number): Promise<MovimientoCalculado[]> {
    const tarifa = await this.tarifas.motor(companyId);
    const motorVehiculos = await this.vehiculos.motor(companyId);
    const fechaDe = (d: Date) => workDateKey(d);

    const [sesiones, viaticos, gastos, salidas, viajes] = await Promise.all([
      this.prisma.activityWorkSession.findMany({
        where: { companyId, endedAt: { not: null }, activity: { deletedAt: null } },
        select: { id: true, activityId: true, userId: true, startedAt: true, endedAt: true, endReason: true },
      }),
      this.prisma.viatico.findMany({
        where: { companyId, deletedAt: null },
        select: {
          id: true,
          actividadId: true,
          usuarioId: true,
          vehicleId: true,
          categoria: true,
          estatus: true,
          montoSolicitado: true,
          montoAprobado: true,
          montoComprobado: true,
          fechaSolicitud: true,
          repartos: { select: { actividadId: true, monto: true } },
        },
      }),
      this.prisma.expense.findMany({
        where: { companyId, deletedAt: null, isAdministrative: false },
        select: {
          id: true,
          actividadId: true,
          usuarioId: true,
          isAdministrative: true,
          estatusPago: true,
          montoSolicitado: true,
          fechaGasto: true,
          fechaSolicitud: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { companyId, activityId: { not: null }, type: { in: ['DISPATCH', 'RETURN'] } },
        select: { id: true, activityId: true, type: true, quantity: true, unitCost: true, totalCost: true, createdAt: true },
      }),
      this.prisma.vehicleControl.findMany({
        where: { companyId, vehicleId: { not: null }, odometroFin: { not: null }, actividad: { deletedAt: null } },
        select: {
          id: true,
          vehicleId: true,
          actividadId: true,
          solicitanteId: true,
          odometroInicio: true,
          odometroFin: true,
          fechaFin: true,
          fechaInicio: true,
          fechaSolicitud: true,
        },
      }),
    ]);

    const salida: MovimientoCalculado[] = movimientosDeSesiones(sesiones, tarifa, fechaDe);
    for (const v of viaticos) {
      if (gasolinaYaEnKm(v, motorVehiculos)) continue;
      salida.push(...movimientosDeViatico({ ...v, fecha: fechaDe(v.fechaSolicitud) }));
    }
    for (const g of gastos) {
      const m = movimientoDeGasto({ ...g, fecha: fechaDe(g.fechaGasto ?? g.fechaSolicitud) });
      if (m) salida.push(m);
    }
    for (const s of salidas) {
      const m = movimientoDeSalida({ ...s, type: String(s.type), fecha: fechaDe(s.createdAt) });
      if (m) salida.push(m);
    }
    for (const v of viajes) {
      const motor = motorVehiculos.get(v.vehicleId as number);
      const km = kmDeSalida(v.odometroInicio, v.odometroFin);
      if (!motor || km == null) continue;
      salida.push(
        movimientoDeViaje(
          {
            id: v.id,
            vehicleId: v.vehicleId as number,
            activityId: v.actividadId,
            userId: v.solicitanteId,
            fecha: fechaDe(v.fechaFin ?? v.fechaInicio ?? v.fechaSolicitud),
            km,
            tarifa: motor.tarifa,
            rendimiento: motor.rendimiento.fuente,
          },
          KM_VIAJE_SOSPECHOSO,
        ),
      );
    }
    return salida;
  }

  /**
   * `recostear`: el vehículo cuyos viajes se vuelven a costear con la tarifa de hoy, porque alguien
   * corrigió su ficha. Sin eso, cada viaje conserva la tarifa de su día.
   */
  async sincronizar(companyId: number, recostear?: { vehicleId: number }): Promise<ResultadoLibro> {
    const calculados = await this.calcular(companyId);
    const existentes = await this.prisma.costoMovimiento.findMany({ where: { companyId } });
    const porOrigen = new Map(existentes.map((e) => [e.origen, e]));
    const deseados = calculados.map((m) =>
      recostear && m.detalle?.vehicleId === recostear.vehicleId ? m : conservarTarifaDeViaje(m, porOrigen.get(m.origen)),
    );
    const deseadoPorOrigen = new Map(deseados.map((m) => [m.origen, m]));

    // Lo que cambió se borra y se vuelve a crear en lote: el libro no se audita, y escribir fila por
    // fila dispara un aviso de tiempo real por cada una.
    const aBorrar: number[] = [];
    const aCrear: MovimientoCalculado[] = [];
    let actualizados = 0;
    for (const m of deseados) {
      const guardado = porOrigen.get(m.origen);
      if (!guardado) {
        aCrear.push(m);
      } else if (guardado.estado !== 'CERRADO' && !igual(guardado, m)) {
        aBorrar.push(guardado.id);
        aCrear.push(m);
        actualizados += 1;
      }
    }
    // Lo que ya no debería estar: su origen se rechazó o se borró.
    let borrados = 0;
    for (const e of existentes) {
      if (e.estado !== 'CERRADO' && !deseadoPorOrigen.has(e.origen)) {
        aBorrar.push(e.id);
        borrados += 1;
      }
    }

    if (aBorrar.length || aCrear.length) {
      await this.prisma.$transaction([
        this.prisma.costoMovimiento.deleteMany({ where: { companyId, id: { in: aBorrar } } }),
        this.prisma.costoMovimiento.createMany({
          data: aCrear.map(({ detalle, ...m }) => ({
            ...m,
            companyId,
            fecha: fechaColumna(m.fecha),
            ...(detalle ? { detalle } : {}),
          })),
          skipDuplicates: true,
        }),
      ]);
    }
    return {
      creados: aCrear.length - actualizados,
      actualizados,
      borrados,
      total: existentes.length - borrados + (aCrear.length - actualizados),
    };
  }
}
