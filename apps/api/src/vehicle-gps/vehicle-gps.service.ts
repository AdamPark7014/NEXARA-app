/**
 * GPS de la flotilla — capa agnóstica del proveedor.
 *
 * Quién lo ve: **solo Dirección General**. La regla es `puedeVerGpsDireccion`,
 * la misma que ya gobierna el GPS de jornada; se reutiliza a propósito para
 * que no existan dos definiciones de «dirección» que puedan separarse.
 *
 * De dónde salen los puntos: de un `ProveedorGps`. Hoy puede ser el adaptador
 * de Hikvision (HCT OpenAPI, monitoreo a bordo) o el simulador, que inventa
 * datos para poder ver el mapa antes de que haya rastreadores montados.
 */

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { puedeVerGpsDireccion } from '../attendance/asistencia-confiable.js';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { kmRecorrido, quitarRepetidos, rangoDelDia, type ProveedorGps, type PuntoGps } from './posiciones.js';
import { HikvisionGpsProvider } from './hikvision.adapter.js';
import { SimuladorGpsProvider } from './simulador.adapter.js';

/**
 * Variables de entorno. Nunca se escriben valores reales en el repo.
 *   VEHICLE_GPS_PROVEEDOR      hikvision | simulador | ninguno   (def. simulador)
 *   VEHICLE_GPS_HIK_HOST       areaDomain inicial, p. ej. https://ius.hikcentralconnect.com
 *   VEHICLE_GPS_HIK_APP_KEY    AK de la cuenta HCT
 *   VEHICLE_GPS_HIK_SECRET_KEY SK de la cuenta HCT
 */
export function proveedorDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ProveedorGps | null {
  const elegido = (env.VEHICLE_GPS_PROVEEDOR ?? 'simulador').trim().toLowerCase();
  if (elegido === 'ninguno' || elegido === 'none' || elegido === 'off') return null;
  if (elegido === 'hikvision') {
    return new HikvisionGpsProvider({
      host: env.VEHICLE_GPS_HIK_HOST ?? '',
      appKey: env.VEHICLE_GPS_HIK_APP_KEY ?? '',
      secretKey: env.VEHICLE_GPS_HIK_SECRET_KEY ?? '',
    });
  }
  return new SimuladorGpsProvider();
}

type Actor = { id?: number; email?: string | null } | null | undefined;

/** Token de inyección: el módulo decide el adaptador, las pruebas lo suplantan. */
export const PROVEEDOR_GPS = 'PROVEEDOR_GPS';

@Injectable()
export class VehicleGpsService {
  private readonly log = new Logger(VehicleGpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PROVEEDOR_GPS)
    private readonly proveedor: ProveedorGps | null = proveedorDesdeEntorno(),
  ) {}

  /** El portón. Idéntico al del GPS de jornada, a propósito. */
  private exigirDireccion(actor: Actor) {
    if (!puedeVerGpsDireccion(actor ?? undefined)) {
      throw new ForbiddenException('El GPS de la flotilla es solo para Dirección General');
    }
  }

  async estado(actor: Actor, companyId?: number | null) {
    this.exigirDireccion(actor);
    const vehiculosConRastreador = await this.prisma['vehicleAsset'].count({
      where: { ...companyWhere(companyId ?? null), gpsDispositivoId: { not: null } },
    });
    return {
      proveedor: this.proveedor?.nombre ?? 'ninguno',
      configurado: Boolean(this.proveedor?.configurado),
      demo: Boolean(this.proveedor?.demo),
      vehiculosConRastreador,
    };
  }

  /** Vehículos con rastreador, con su id de equipo en el proveedor. */
  private async vehiculosRastreados(companyId?: number | null) {
    return this.prisma['vehicleAsset'].findMany({
      where: {
        ...companyWhere(companyId ?? null),
        activo: true,
        gpsDispositivoId: { not: null },
      },
      select: {
        id: true,
        nombre: true,
        placas: true,
        gpsProveedor: true,
        gpsDispositivoId: true,
        companyId: true,
      },
    });
  }

  /**
   * Guarda un lote de puntos. **Idempotente**: un mismo equipo no puede tener
   * dos puntos con el mismo instante, y el índice único
   * `(vehicleAssetId, at)` lo garantiza en la base. Aquí se descartan además
   * los que ya existen, para no pelearse con la base en cada sondeo.
   */
  async guardarPuntos(
    puntos: PuntoGps[],
    porDispositivo: Map<string, { id: number; companyId: number }>,
  ): Promise<{ guardados: number; repetidos: number }> {
    const limpios = quitarRepetidos(puntos).filter((p) => porDispositivo.has(p.dispositivoId));
    if (limpios.length === 0) return { guardados: 0, repetidos: 0 };

    const filas = limpios.map((p) => {
      const vehiculo = porDispositivo.get(p.dispositivoId)!;
      return {
        vehicleAssetId: vehiculo.id,
        companyId: vehiculo.companyId,
        lat: p.lat,
        lng: p.lng,
        velocidadKmh: p.velocidadKmh,
        rumbo: p.rumbo,
        at: p.at,
      };
    });

    // `skipDuplicates` se apoya en el índice único: una reentrega del proveedor
    // no duplica nada y tampoco revienta la pasada.
    const res = await this.prisma['vehiclePosition'].createMany({
      data: filas,
      skipDuplicates: true,
    });
    const guardados = typeof res?.count === 'number' ? res.count : 0;
    return { guardados, repetidos: filas.length - guardados };
  }

  /** Una pasada de sondeo contra el proveedor configurado. */
  async sincronizar(actor: Actor, companyId?: number | null) {
    this.exigirDireccion(actor);
    if (!this.proveedor) return { proveedor: 'ninguno', guardados: 0, repetidos: 0, demo: false };

    const vehiculos = await this.vehiculosRastreados(companyId);
    const porDispositivo = new Map(
      vehiculos
        .filter((v: any) => v.gpsDispositivoId)
        .map((v: any) => [String(v.gpsDispositivoId), { id: v.id, companyId: v.companyId }]),
    );
    if (porDispositivo.size === 0) {
      return { proveedor: this.proveedor.nombre, guardados: 0, repetidos: 0, demo: this.proveedor.demo };
    }

    const ultimo = await this.prisma['vehiclePosition'].findFirst({
      where: {
        ...companyWhere(companyId ?? null),
        vehicleAssetId: { in: [...porDispositivo.values()].map((v) => v.id) },
      },
      orderBy: { at: 'desc' },
      select: { at: true },
    });

    let puntos: PuntoGps[] = [];
    try {
      puntos = await this.proveedor.puntosRecientes([...porDispositivo.keys()], ultimo?.at ?? null);
    } catch (err) {
      // Que el proveedor esté caído no puede tumbar la pantalla: se responde
      // con lo que ya hay guardado.
      this.log.warn(`Sondeo GPS falló (${this.proveedor.nombre}): ${(err as Error).message}`);
      return {
        proveedor: this.proveedor.nombre,
        guardados: 0,
        repetidos: 0,
        demo: this.proveedor.demo,
        error: 'No se pudo consultar al proveedor',
      };
    }

    const { guardados, repetidos } = await this.guardarPuntos(puntos, porDispositivo);
    return { proveedor: this.proveedor.nombre, guardados, repetidos, demo: this.proveedor.demo };
  }

  /** Quién trae el vehículo ahora mismo, según la asignación viva. */
  private async conductoresDelMomento(vehicleIds: number[], companyId?: number | null) {
    if (vehicleIds.length === 0) return new Map<number, { id: number; nombre: string }>();
    const controles = await this.prisma['vehicleControl'].findMany({
      where: {
        ...companyWhere(companyId ?? null),
        vehicleId: { in: vehicleIds },
        estatusAprobacion: 'Aprobado',
        entregaEstatus: 'En uso',
      },
      select: { vehicleId: true, solicitante: { select: { id: true, nombre: true } } },
    });
    const mapa = new Map<number, { id: number; nombre: string }>();
    for (const c of controles) {
      if (c.vehicleId && c.solicitante) mapa.set(c.vehicleId, c.solicitante);
    }

    // Una salida directa de inventario no deja VehicleControl.
    const assets = await this.prisma['vehicleAsset'].findMany({
      where: { id: { in: vehicleIds }, assignedToId: { not: null } },
      select: { id: true, assignedTo: { select: { id: true, nombre: true } } },
    });
    for (const a of assets) {
      if (a.assignedTo && !mapa.has(a.id)) mapa.set(a.id, a.assignedTo);
    }
    return mapa;
  }

  /** Última posición conocida de cada vehículo con rastreador. */
  async posiciones(actor: Actor, companyId?: number | null) {
    this.exigirDireccion(actor);
    const vehiculos = await this.vehiculosRastreados(companyId);
    const ids = vehiculos.map((v: any) => v.id);
    const conductores = await this.conductoresDelMomento(ids, companyId);

    const posiciones = await Promise.all(
      vehiculos.map(async (v: any) => {
        const ultima = await this.prisma['vehiclePosition'].findFirst({
          where: { vehicleAssetId: v.id },
          orderBy: { at: 'desc' },
        });
        if (!ultima) return null;
        return {
          vehicleAssetId: v.id,
          nombre: v.nombre,
          placas: v.placas ?? null,
          lat: Number(ultima.lat),
          lng: Number(ultima.lng),
          velocidadKmh: ultima.velocidadKmh == null ? null : Number(ultima.velocidadKmh),
          rumbo: ultima.rumbo == null ? null : Number(ultima.rumbo),
          at: ultima.at,
          conductor: conductores.get(v.id) ?? null,
        };
      }),
    );

    return {
      demo: Boolean(this.proveedor?.demo),
      proveedor: this.proveedor?.nombre ?? 'ninguno',
      posiciones: posiciones.filter(Boolean),
    };
  }

  /** Recorrido de un vehículo en un día, para el replay del mapa. */
  async recorrido(actor: Actor, vehicleAssetId: number, fecha: string, companyId?: number | null) {
    this.exigirDireccion(actor);

    const vehiculo = await this.prisma['vehicleAsset'].findFirst({
      where: { id: vehicleAssetId, ...companyWhere(companyId ?? null) },
      select: { id: true, nombre: true, placas: true },
    });
    if (!vehiculo) throw new BadRequestException('Vehículo no encontrado');

    let rango: { desde: Date; hasta: Date };
    try {
      rango = rangoDelDia(fecha);
    } catch {
      throw new BadRequestException('Fecha inválida, se espera YYYY-MM-DD');
    }

    const filas = await this.prisma['vehiclePosition'].findMany({
      where: { vehicleAssetId, at: { gte: rango.desde, lt: rango.hasta } },
      orderBy: { at: 'asc' },
    });

    const puntos = filas.map((p: any) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      velocidadKmh: p.velocidadKmh == null ? null : Number(p.velocidadKmh),
      rumbo: p.rumbo == null ? null : Number(p.rumbo),
      at: p.at,
    }));

    const conductores = await this.conductoresDelMomento([vehicleAssetId], companyId);

    return {
      demo: Boolean(this.proveedor?.demo),
      vehiculo,
      conductor: conductores.get(vehicleAssetId) ?? null,
      puntos,
      kmAprox: kmRecorrido(puntos),
    };
  }
}
