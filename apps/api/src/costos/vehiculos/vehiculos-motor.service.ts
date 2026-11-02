import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { numero } from '../calculos/numeros.js';
import { tarifaDeVehiculo, type CargaDeCalculo, type TarifaVehiculo } from '../calculos/vehiculo.js';
import type { FichaEquipoCalculo } from '../calculos/tarifa-equipo.js';
import { fichaACalculo } from '../costos-tarifas.service.js';

export type MotorVehiculo = TarifaVehiculo & { ficha: FichaEquipoCalculo; fichaId: number };

export const cargaDeCalculo = (c: {
  fecha: Date;
  odometro: number;
  litros: unknown;
  importe: unknown;
  tanqueLleno: boolean;
}): CargaDeCalculo => ({
  fecha: c.fecha,
  odometro: c.odometro,
  litros: numero(c.litros),
  importe: numero(c.importe),
  tanqueLleno: c.tanqueLleno,
});

/**
 * Tarifa vigente de cada vehículo con ficha: la ficha pone lo que no cambia, y las cargas, el rendimiento
 * y el precio reales. Sin ficha no hay tarifa y sus viajes no se costean.
 */
@Injectable()
export class VehiculosMotorService {
  constructor(private readonly prisma: PrismaService) {}

  async motor(companyId: number): Promise<Map<number, MotorVehiculo>> {
    const fichas = await this.prisma.costoFichaEquipo.findMany({
      where: { companyId, tipo: 'VEHICULO', activo: true, vehicleId: { not: null } },
      orderBy: { id: 'asc' },
    });
    if (!fichas.length) return new Map();
    const ids = fichas.map((f) => f.vehicleId as number);
    const [especificaciones, cargas] = await Promise.all([
      this.prisma.vehiculoEspecificacion.findMany({
        where: { companyId, vehicleId: { in: ids } },
        select: { vehicleId: true, rendimientoOficial: true },
      }),
      this.prisma.vehiculoCarga.findMany({
        where: { companyId, vehicleId: { in: ids } },
        select: { vehicleId: true, fecha: true, odometro: true, litros: true, importe: true, tanqueLleno: true },
      }),
    ]);
    const oficialDe = new Map(
      especificaciones.map((e) => [e.vehicleId, e.rendimientoOficial == null ? null : numero(e.rendimientoOficial)]),
    );
    const salida = new Map<number, MotorVehiculo>();
    for (const f of fichas) {
      const id = f.vehicleId as number;
      const ficha = fichaACalculo(f);
      const suyas = cargas.filter((c) => c.vehicleId === id).map(cargaDeCalculo);
      salida.set(id, { ...tarifaDeVehiculo(ficha, oficialDe.get(id), suyas), ficha, fichaId: f.id });
    }
    return salida;
  }
}
