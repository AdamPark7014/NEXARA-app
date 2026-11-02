import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { workDateKey } from '../../common/time/workday.js';
import { numero, redondear } from '../calculos/numeros.js';
import {
  TANQUES_PARA_RENDIMIENTO_REAL,
  autonomia,
  costoParado,
  desgaste,
  desgloseDeTarifa,
  kmDeSalida,
  kmDelPeriodo,
  odometroVigente,
  programaDeServicio,
  proximoServicio,
  rendimientoVigente,
  tanquesMedidos,
  valorEstimado,
  type Lectura,
  type ServicioDeCalculo,
} from '../calculos/vehiculo.js';
import { veTodoCostos, type ActorCostos } from '../costos-acceso.js';
import { CostosTarifasService } from '../costos-tarifas.service.js';
import { LibroCostosService } from '../libro-costos.service.js';
import { VehiculosMotorService, cargaDeCalculo } from './vehiculos-motor.service.js';

export type TipoDestino = 'PROYECTO' | 'COTIZACION' | 'OFICINA' | 'SIN_LIGAR';
export type Destino = { tipo: TipoDestino; id: number | null; nombre: string | null };

/** Valores iniciales de la ficha de costo. El Reglamento da la fórmula, no estas cifras: se ajustan. */
export const OMISIONES_COSTO = {
  valorLlantas: 12000,
  rescatePct: 0.3,
  vidaKm: 200000,
  kmAnio: 30000,
  tasaInteres: 0.12,
  primaSeguro: 0.04,
  ko: 0.6,
  precioCombustible: 24.5,
  costoAceite: 1200,
  aceiteCadaKm: 10000,
  vidaLlantasKm: 50000,
  otrosAnuales: 0,
};

export type PlanEstandar = { concepto: string; cadaKm: number | null; cadaMeses: number | null };

/** Programa de partida de quien aún no tiene manual. Es de NEXARA, no del fabricante: se ajusta en Tarifas. */
export const PLAN_ESTANDAR: ReadonlyArray<PlanEstandar> = [
  { concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 12 },
  { concepto: 'Rotación de llantas', cadaKm: 10000, cadaMeses: null },
  { concepto: 'Revisión de frenos', cadaKm: 20000, cadaMeses: 12 },
  { concepto: 'Filtro de aire', cadaKm: 20000, cadaMeses: 12 },
];

export type EstandarVehiculos = typeof OMISIONES_COSTO & { plan: PlanEstandar[] };

const CLAVE_ESTANDAR = 'vehiculos.estandar';
const CAMPOS_ESTANDAR = Object.keys(OMISIONES_COSTO) as Array<keyof typeof OMISIONES_COSTO>;

const positivoONulo = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** Lo guardado sobre los valores de fábrica. Un dato dañado no debe tumbar el alta de un vehículo. */
export function estandarDesde(guardado: string | null | undefined): EstandarVehiculos {
  const salida: EstandarVehiculos = { ...OMISIONES_COSTO, plan: PLAN_ESTANDAR.map((p) => ({ ...p })) };
  if (!guardado) return salida;
  let datos: any;
  try {
    datos = JSON.parse(guardado);
  } catch {
    return salida;
  }
  if (!datos || typeof datos !== 'object') return salida;
  for (const campo of CAMPOS_ESTANDAR) {
    if (typeof datos[campo] === 'number' && Number.isFinite(datos[campo])) salida[campo] = datos[campo];
  }
  if (Array.isArray(datos.plan)) {
    salida.plan = datos.plan
      .map((p: any) => ({ concepto: String(p?.concepto ?? '').trim().slice(0, 120), cadaKm: positivoONulo(p?.cadaKm), cadaMeses: positivoONulo(p?.cadaMeses) }))
      .filter((p: PlanEstandar) => p.concepto && (p.cadaKm != null || p.cadaMeses != null));
  }
  return salida;
}

export const TIPOS_DOCUMENTO = ['MANUAL', 'TARJETA', 'POLIZA', 'VERIFICACION', 'OTRO'] as const;

const DIA_MS = 86_400_000;
const DIAS_DOCUMENTO_PRONTO = 30;
/** Hora de México: un mes va del día 1 a las 00:00 local. */
const ZONA = '-06:00';
const RUTA_SUBIDAS = '/uploads/vehicles/';

export type CostoFichaDatos = Partial<typeof OMISIONES_COSTO> & { valor?: number };
export type DatosEstandar = Partial<typeof OMISIONES_COSTO> & { plan?: ReadonlyArray<Partial<PlanEstandar>> | null };

export type DatosFichaVehiculo = {
  nombre?: string | null;
  placas?: string | null;
  notas?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  version?: string | null;
  numeroSerie?: string | null;
  motor?: string | null;
  potenciaHp?: number | null;
  transmision?: string | null;
  combustible?: string | null;
  tanqueLitros?: number | null;
  aceiteTipo?: string | null;
  aceiteLitros?: number | null;
  llantaMedida?: string | null;
  llantaPsi?: number | null;
  cargaKg?: number | null;
  rendimientoOficial?: number | null;
  fechaCompra?: string | null;
  odometroCompra?: number | null;
  odometroAlta?: number | null;
  fuentes?: Record<string, unknown> | null;
  plan?: ReadonlyArray<DatosPlan> | null;
  costo?: CostoFichaDatos | null;
  manual?: { url: string; nombre: string; paginas?: number | null } | null;
};

export type DatosPlan = {
  id?: number | null;
  concepto: string;
  cadaKm?: number | null;
  cadaMeses?: number | null;
  costoEstimado?: number | null;
  paginaManual?: number | null;
};

export type DatosServicio = {
  fecha: string;
  odometro?: number | null;
  concepto: string;
  costo?: number | null;
  proveedor?: string | null;
  notas?: string | null;
  planIds?: number[];
  comprobanteUrl?: string | null;
};

export type DatosCarga = {
  fecha?: string | null;
  odometro: number;
  litros: number;
  importe: number;
  tanqueLleno: boolean;
  ticketUrl?: string | null;
  tableroUrl?: string | null;
};

const texto = (v: string | null | undefined, largo: number) => {
  if (v === undefined) return undefined;
  const limpio = String(v ?? '').trim().slice(0, largo);
  return limpio || null;
};

const fechaColumna = (fecha: string | null | undefined) => {
  if (!fecha) return null;
  const f = new Date(`${String(fecha).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(f.getTime())) throw new BadRequestException('Fecha inválida');
  return f;
};

/** `2026-10` → el primer instante del mes y el del siguiente, en hora de México. */
export function limitesDelMes(mes: string): { desde: Date; hasta: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new BadRequestException('Mes inválido');
  const [anio, m] = mes.split('-').map(Number);
  const siguiente = m === 12 ? `${anio + 1}-01` : `${anio}-${String(m + 1).padStart(2, '0')}`;
  return { desde: new Date(`${mes}-01T00:00:00${ZONA}`), hasta: new Date(`${siguiente}-01T00:00:00${ZONA}`) };
}

/** La lista de chequeo guarda el odómetro dentro de un JSON. */
function kmDelJson(json: unknown): number | null {
  const v = (json as { odometroKm?: unknown } | null | undefined)?.odometroKm;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function estadoDocumento(venceEl: Date | null, hoy: Date): 'VENCIDO' | 'PRONTO' | 'VIGENTE' | 'SIN_FECHA' {
  if (!venceEl) return 'SIN_FECHA';
  const dias = Math.ceil((venceEl.getTime() - hoy.getTime()) / DIA_MS);
  if (dias < 0) return 'VENCIDO';
  return dias <= DIAS_DOCUMENTO_PRONTO ? 'PRONTO' : 'VIGENTE';
}

type VehiculoLeido = {
  asset: Record<string, any>;
  espec: Record<string, any> | null;
  planes: Array<Record<string, any>>;
  servicios: Array<Record<string, any>>;
  cargas: Array<Record<string, any>>;
  controles: Array<Record<string, any>>;
  documentos: Array<Record<string, any>>;
};

/**
 * Ficha, gasolina, servicios y flotilla (`docs/COSTOS-PRECIOS-UNITARIOS.md`, «Fase 3 ampliada»).
 *
 * El costo y el valor solo los ve quien ya ve costos completos; los técnicos ven kilómetros y rendimiento.
 */
@Injectable()
export class CostosVehiculosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: VehiculosMotorService,
    private readonly tarifas: CostosTarifasService,
    private readonly libro: LibroCostosService,
  ) {}

  /* ── Lectura ────────────────────────────────────────────────────────────── */

  private async leer(companyId: number, ids: number[]): Promise<Map<number, VehiculoLeido>> {
    const [assets, especs, planes, servicios, cargas, controles, documentos] = await Promise.all([
      this.prisma.vehicleAsset.findMany({ where: { companyId, id: { in: ids } } }),
      this.prisma.vehiculoEspecificacion.findMany({ where: { companyId, vehicleId: { in: ids } } }),
      this.prisma.vehiculoServicioPlan.findMany({
        where: { companyId, vehicleId: { in: ids }, activo: true },
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.vehiculoServicio.findMany({
        where: { companyId, vehicleId: { in: ids } },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.vehiculoCarga.findMany({
        where: { companyId, vehicleId: { in: ids } },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.vehicleControl.findMany({
        where: { companyId, vehicleId: { in: ids } },
        orderBy: { fechaSolicitud: 'desc' },
        select: {
          id: true,
          vehicleId: true,
          actividadId: true,
          odometroInicio: true,
          odometroFin: true,
          fechaInicio: true,
          fechaFin: true,
          fechaSolicitud: true,
          fotoTableroDevolucionUrl: true,
          fotosDevolucion: true,
          actividad: { select: { id: true, anNumber: true, titulo: true } },
        },
      }),
      this.prisma.vehiculoDocumento.findMany({
        where: { companyId, vehicleId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const salida = new Map<number, VehiculoLeido>();
    for (const asset of assets) {
      const de = <T extends { vehicleId: number | null }>(filas: T[]) => filas.filter((f) => f.vehicleId === asset.id);
      salida.set(asset.id, {
        asset,
        espec: especs.find((e) => e.vehicleId === asset.id) ?? null,
        planes: de(planes),
        servicios: de(servicios),
        cargas: de(cargas),
        controles: de(controles),
        documentos: de(documentos),
      });
    }
    return salida;
  }

  /** Toda lectura del odómetro que exista: salidas, regresos, cargas, servicios y el alta. */
  private lecturas(v: VehiculoLeido): Lectura[] {
    const salida: Lectura[] = [];
    if (v.espec?.odometroAlta != null) salida.push({ fecha: v.espec.createdAt, odometro: v.espec.odometroAlta });
    for (const c of v.controles) {
      if (c.odometroInicio != null) {
        salida.push({ fecha: c.fechaInicio ?? c.fechaSolicitud, odometro: c.odometroInicio });
      }
      if (c.odometroFin != null) salida.push({ fecha: c.fechaFin ?? c.fechaInicio ?? c.fechaSolicitud, odometro: c.odometroFin });
    }
    for (const c of v.cargas) salida.push({ fecha: c.fecha, odometro: c.odometro });
    for (const s of v.servicios) if (s.odometro != null) salida.push({ fecha: s.fecha, odometro: s.odometro });
    const salidaInventario = kmDelJson(v.asset.salidaFotos);
    if (salidaInventario != null) salida.push({ fecha: v.asset.assignedAt ?? v.asset.updatedAt, odometro: salidaInventario });
    const regresoInventario = kmDelJson(v.asset.devolucionFotos);
    if (regresoInventario != null) salida.push({ fecha: v.asset.updatedAt, odometro: regresoInventario });
    return salida;
  }

  private serviciosDeCalculo(v: VehiculoLeido): ServicioDeCalculo[] {
    return v.servicios.map((s) => ({
      fecha: s.fecha,
      odometro: s.odometro,
      concepto: s.concepto,
      costo: numero(s.costo),
      planIds: s.planIds ?? [],
    }));
  }

  private programa(v: VehiculoLeido, odometro: number, hoy: Date) {
    return programaDeServicio(
      v.planes.map((p) => ({
        id: p.id,
        concepto: p.concepto,
        cadaKm: p.cadaKm,
        cadaMeses: p.cadaMeses,
        costoEstimado: p.costoEstimado == null ? null : numero(p.costoEstimado),
        paginaManual: p.paginaManual,
      })),
      this.serviciosDeCalculo(v),
      {
        odometro,
        odometroAlta: v.espec?.odometroAlta ?? null,
        fechaBase: v.espec?.fechaCompra ?? v.espec?.createdAt ?? null,
        hoy,
      },
    );
  }

  /** A dónde se cargan unas actividades: la liga de la bandeja manda sobre lo que traiga la actividad. */
  private async destinos(companyId: number, activityIds: number[]): Promise<Map<number, Destino>> {
    const ids = [...new Set(activityIds)];
    const salida = new Map<number, Destino>();
    if (!ids.length) return salida;
    const [ligas, actividades, proyectos] = await Promise.all([
      this.prisma.costoActividadLiga.findMany({ where: { companyId, activityId: { in: ids }, tipo: { not: null } } }),
      this.prisma.activity.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, projectId: true, cotizacionId: true } }),
      this.prisma.operationalProject.findMany({ where: { companyId }, select: { id: true, title: true, cotizacionId: true } }),
    ]);
    const ligaDe = new Map(ligas.map((l) => [l.activityId, l]));
    const proyectoPorId = new Map(proyectos.map((p) => [p.id, p]));
    const proyectoDeCotizacion = new Map(proyectos.filter((p) => p.cotizacionId).map((p) => [p.cotizacionId as number, p]));
    const cotizacionIds = new Set<number>();
    const anclas = new Map<number, { proyectoId: number | null; cotizacionId: number | null; interna: boolean }>();
    for (const a of actividades) {
      const l = ligaDe.get(a.id);
      const ancla =
        l?.tipo === 'INTERNA'
          ? { proyectoId: null, cotizacionId: null, interna: true }
          : l
            ? { proyectoId: l.proyectoId, cotizacionId: l.cotizacionId, interna: false }
            : { proyectoId: a.projectId, cotizacionId: a.cotizacionId, interna: false };
      if (ancla.cotizacionId) cotizacionIds.add(ancla.cotizacionId);
      anclas.set(a.id, ancla);
    }
    const cotizaciones = cotizacionIds.size
      ? await this.prisma.cotizacion.findMany({
          where: { companyId, id: { in: [...cotizacionIds] } },
          select: { id: true, quoteNumber: true },
        })
      : [];
    const folioDe = new Map(cotizaciones.map((c) => [c.id, c.quoteNumber]));
    for (const [activityId, a] of anclas) {
      const proyecto =
        (a.proyectoId ? proyectoPorId.get(a.proyectoId) : null) ?? (a.cotizacionId ? proyectoDeCotizacion.get(a.cotizacionId) : null);
      if (a.interna) salida.set(activityId, { tipo: 'OFICINA', id: null, nombre: null });
      else if (proyecto) salida.set(activityId, { tipo: 'PROYECTO', id: proyecto.id, nombre: proyecto.title });
      else if (a.cotizacionId) {
        salida.set(activityId, { tipo: 'COTIZACION', id: a.cotizacionId, nombre: folioDe.get(a.cotizacionId) ?? null });
      } else salida.set(activityId, { tipo: 'SIN_LIGAR', id: null, nombre: null });
    }
    return salida;
  }

  /** Lo que el libro ya costeó de estas salidas, para no recalcularlo con la tarifa de hoy. */
  private async importesDelLibro(companyId: number, controlIds: number[]) {
    if (!controlIds.length) return new Map<number, number>();
    const filas = await this.prisma.costoMovimiento.findMany({
      where: { companyId, origen: { in: controlIds.map((id) => `VEHICULO:${id}`) } },
      select: { origen: true, importe: true },
    });
    return new Map(filas.map((f) => [Number(f.origen.split(':')[1]), numero(f.importe)]));
  }

  /* ── Ficha ──────────────────────────────────────────────────────────────── */

  /** Con qué arranca un vehículo nuevo. Las cifras de dinero, solo para quien ve costos. */
  async omisiones(companyId: number | null, actor: ActorCostos) {
    const { plan, ...costos } = await this.estandar(requireCompanyId(companyId));
    return veTodoCostos(actor) ? { ...costos, plan } : { plan };
  }

  /** `SystemSetting` no filtra solo por empresa: la consulta lleva el `companyId`. */
  private async estandar(companyId: number): Promise<EstandarVehiculos> {
    const fila = await this.prisma.systemSetting.findFirst({ where: { key: CLAVE_ESTANDAR, companyId }, select: { value: true } });
    return estandarDesde(fila?.value);
  }

  /** Solo cambia con qué arrancan los vehículos nuevos: las fichas guardadas conservan sus cifras. */
  async guardarEstandar(companyId: number | null, d: DatosEstandar, actor: ActorCostos) {
    if (!veTodoCostos(actor)) throw new ForbiddenException('El estándar lo ajusta dirección o contabilidad');
    const tenantId = requireCompanyId(companyId);
    const siguiente = await this.estandar(tenantId);
    for (const campo of CAMPOS_ESTANDAR) {
      const valor = d[campo];
      if (valor != null) siguiente[campo] = valor;
    }
    if (d.plan) {
      siguiente.plan = d.plan.flatMap((p) => {
        const concepto = String(p.concepto ?? '').trim().slice(0, 120);
        if (!concepto) return [];
        if (p.cadaKm == null && p.cadaMeses == null) throw new BadRequestException(`A «${concepto}» le falta cada cuánto toca`);
        return [{ concepto, cadaKm: p.cadaKm ?? null, cadaMeses: p.cadaMeses ?? null }];
      });
    }
    const value = JSON.stringify(siguiente);
    const fila = await this.prisma.systemSetting.findFirst({ where: { key: CLAVE_ESTANDAR, companyId: tenantId }, select: { id: true } });
    if (fila) await this.prisma.systemSetting.update({ where: { id: fila.id }, data: { value } });
    else await this.prisma.systemSetting.create({ data: { key: CLAVE_ESTANDAR, value, category: 'costos', label: 'Estándar de vehículos', companyId: tenantId } });
    return siguiente;
  }

  async ficha(companyId: number | null, id: number, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const v = (await this.leer(tenantId, [id])).get(id);
    if (!v) throw new NotFoundException('Vehículo no encontrado');
    const hoy = new Date();
    const veCostos = veTodoCostos(actor);
    const motor = (await this.motor.motor(tenantId)).get(id) ?? null;

    const odometro = odometroVigente(this.lecturas(v));
    const km = odometro?.km ?? 0;
    const cargas = v.cargas.map((c) => cargaDeCalculo(c as any));
    const tanques = tanquesMedidos(cargas);
    const oficial = v.espec?.rendimientoOficial == null ? null : numero(v.espec.rendimientoOficial);
    const rendimiento = motor?.rendimiento ?? rendimientoVigente(oficial, tanques);
    const programa = this.programa(v, km, hoy);
    const servicios = this.serviciosDeCalculo(v);
    const ficha = motor?.ficha ?? null;

    const cerradas = v.controles.filter((c) => kmDeSalida(c.odometroInicio, c.odometroFin) != null);
    const [destinos, importes] = await Promise.all([
      this.destinos(tenantId, cerradas.map((c) => c.actividadId)),
      veCostos ? this.importesDelLibro(tenantId, cerradas.map((c) => c.id)) : Promise.resolve(new Map<number, number>()),
    ]);
    const viajes = cerradas.slice(0, 50).map((c) => {
      const kmViaje = kmDeSalida(c.odometroInicio, c.odometroFin) as number;
      return {
        id: c.id,
        fecha: workDateKey(c.fechaFin ?? c.fechaInicio ?? c.fechaSolicitud),
        actividad: c.actividad ? { id: c.actividad.id, folio: c.actividad.anNumber, titulo: c.actividad.titulo } : null,
        destino: destinos.get(c.actividadId) ?? { tipo: 'SIN_LIGAR', id: null, nombre: null },
        km: kmViaje,
        importe: veCostos ? (importes.get(c.id) ?? (motor ? redondear(kmViaje * motor.tarifa.total) : null)) : null,
        sinFoto: !c.fotoTableroDevolucionUrl,
      };
    });

    const costoServicios = servicios.reduce((a, s) => a + s.costo, 0);
    return {
      vehiculo: {
        id: v.asset.id,
        nombre: v.asset.nombre,
        placas: v.asset.placas ?? null,
        estatus: v.asset.estatus,
        activo: v.asset.activo !== false,
      },
      tieneFicha: Boolean(v.espec),
      especificacion: v.espec
        ? {
            marca: v.espec.marca,
            modelo: v.espec.modelo,
            anio: v.espec.anio,
            version: v.espec.version,
            numeroSerie: v.espec.numeroSerie,
            motor: v.espec.motor,
            potenciaHp: v.espec.potenciaHp,
            transmision: v.espec.transmision,
            combustible: v.espec.combustible,
            tanqueLitros: v.espec.tanqueLitros == null ? null : numero(v.espec.tanqueLitros),
            aceiteTipo: v.espec.aceiteTipo,
            aceiteLitros: v.espec.aceiteLitros == null ? null : numero(v.espec.aceiteLitros),
            llantaMedida: v.espec.llantaMedida,
            llantaPsi: v.espec.llantaPsi,
            cargaKg: v.espec.cargaKg,
            rendimientoOficial: oficial,
            fechaCompra: v.espec.fechaCompra ? new Date(v.espec.fechaCompra).toISOString().slice(0, 10) : null,
            odometroCompra: v.espec.odometroCompra,
            odometroAlta: v.espec.odometroAlta,
            fuentes: v.espec.fuentes ?? {},
          }
        : null,
      odometro,
      rendimiento,
      autonomiaKm: autonomia(v.espec?.tanqueLitros == null ? null : numero(v.espec.tanqueLitros), rendimiento.usado),
      tanques: tanques.slice(-8),
      cargas: v.cargas.slice(0, 30).map((c) => ({
        id: c.id,
        fecha: new Date(c.fecha).toISOString(),
        odometro: c.odometro,
        litros: numero(c.litros),
        importe: numero(c.importe),
        tanqueLleno: c.tanqueLleno,
        ticketUrl: c.ticketUrl,
        tableroUrl: c.tableroUrl,
      })),
      programa,
      proximoServicio: proximoServicio(programa),
      servicios: v.servicios.slice(0, 30).map((s) => ({
        id: s.id,
        fecha: new Date(s.fecha).toISOString().slice(0, 10),
        odometro: s.odometro,
        concepto: s.concepto,
        costo: veCostos ? numero(s.costo) : null,
        proveedor: s.proveedor,
        comprobanteUrl: s.comprobanteUrl,
        notas: s.notas,
      })),
      documentos: v.documentos.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        nombre: d.nombre,
        url: d.url,
        paginas: d.paginas,
        venceEl: d.venceEl ? new Date(d.venceEl).toISOString().slice(0, 10) : null,
        estado: estadoDocumento(d.venceEl, hoy),
      })),
      desgaste: desgaste(
        {
          odometro: km,
          odometroCompra: v.espec?.odometroCompra ?? null,
          vidaKm: ficha?.vidaUnidades ?? null,
          vidaLlantasKm: ficha?.vidaLlantasUnidades ?? null,
          aceiteCadaKm: ficha?.aceiteCadaUnidades ?? null,
        },
        servicios,
      ),
      viajes,
      costos:
        veCostos && motor && ficha
          ? {
              fichaId: motor.fichaId,
              ficha: {
                valor: ficha.valor,
                valorLlantas: ficha.valorLlantas ?? 0,
                rescatePct: ficha.rescatePct ?? 0,
                vidaKm: ficha.vidaUnidades,
                kmAnio: ficha.unidadesAnio,
                tasaInteres: ficha.tasaInteres ?? 0,
                primaSeguro: ficha.primaSeguro ?? 0,
                ko: ficha.ko ?? 0,
                costoAceite: ficha.costoAceite ?? 0,
                aceiteCadaKm: ficha.aceiteCadaUnidades ?? 0,
                vidaLlantasKm: ficha.vidaLlantasUnidades ?? 0,
                otrosAnuales: ficha.otrosAnuales ?? 0,
              },
              porKm: motor.tarifa.total,
              desglose: desgloseDeTarifa(motor.tarifa),
              precioLitro: motor.precioLitro,
              valorEstimado: valorEstimado(ficha, motor.tarifa.d, km - (v.espec?.odometroCompra ?? 0)),
              mantenimiento: {
                apartado: redondear(motor.tarifa.mn * Math.max(0, km - (v.espec?.odometroCompra ?? 0))),
                gastado: redondear(costoServicios),
              },
            }
          : null,
      avisos: {
        sinFichaDeCosto: !motor,
        tanquesFaltantes: rendimiento.fuente === 'REAL' ? 0 : TANQUES_PARA_RENDIMIENTO_REAL - tanques.length,
        salidasSinFoto: cerradas.filter((c) => !c.fotoTableroDevolucionUrl).length,
        sinSalidas: cerradas.length === 0,
      },
      acceso: { veCostos },
    };
  }

  /* ── Flotilla del mes ───────────────────────────────────────────────────── */

  async flotilla(companyId: number | null, mes: string | undefined, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const hoy = new Date();
    const periodo = mes?.trim() || workDateKey(hoy).slice(0, 7);
    const { desde, hasta } = limitesDelMes(periodo);
    const veCostos = veTodoCostos(actor);

    const assets = await this.prisma.vehicleAsset.findMany({ where: { companyId: tenantId, activo: true }, select: { id: true } });
    const leidos = await this.leer(tenantId, assets.map((a) => a.id));
    const motor = await this.motor.motor(tenantId);
    const delMes = (c: Record<string, any>) => {
      const fin = c.fechaFin ?? c.fechaInicio ?? c.fechaSolicitud;
      return kmDeSalida(c.odometroInicio, c.odometroFin) != null && new Date(fin) >= desde && new Date(fin) < hasta;
    };
    const todasDelMes = [...leidos.values()].flatMap((v) => v.controles.filter(delMes));
    const [destinos, importes] = await Promise.all([
      this.destinos(tenantId, todasDelMes.map((c) => c.actividadId)),
      this.importesDelLibro(tenantId, todasDelMes.map((c) => c.id)),
    ]);

    const reparto: Record<TipoDestino, { km: number; importe: number }> = {
      PROYECTO: { km: 0, importe: 0 },
      COTIZACION: { km: 0, importe: 0 },
      OFICINA: { km: 0, importe: 0 },
      SIN_LIGAR: { km: 0, importe: 0 },
    };
    let parado = 0;
    const avisos: Array<{ tono: 'danger' | 'warning' | 'info'; titulo: string; texto: string; vehicleId: number }> = [];

    const vehiculos = [...leidos.values()]
      .sort((a, b) => String(a.asset.nombre).localeCompare(String(b.asset.nombre)))
      .map((v) => {
        const lecturas = this.lecturas(v);
        const odometro = odometroVigente(lecturas);
        const km = kmDelPeriodo(lecturas, desde, hasta);
        const m = motor.get(v.asset.id) ?? null;
        const programa = this.programa(v, odometro?.km ?? 0, hoy);
        const proximo = proximoServicio(programa);
        const oficial = v.espec?.rendimientoOficial == null ? null : numero(v.espec.rendimientoOficial);
        const rendimiento = m?.rendimiento ?? rendimientoVigente(oficial, tanquesMedidos(v.cargas.map((c) => cargaDeCalculo(c as any))));

        // Lo que tiene salida va a su destino; lo que el odómetro avanzó sin salida queda sin ligar.
        let kmConSalida = 0;
        for (const c of v.controles.filter(delMes)) {
          const kmViaje = kmDeSalida(c.odometroInicio, c.odometroFin) as number;
          kmConSalida += kmViaje;
          const tipo = destinos.get(c.actividadId)?.tipo ?? 'SIN_LIGAR';
          reparto[tipo].km += kmViaje;
          reparto[tipo].importe += importes.get(c.id) ?? (m ? kmViaje * m.tarifa.total : 0);
        }
        const kmSinSalida = Math.max(0, km - kmConSalida);
        reparto.SIN_LIGAR.km += kmSinSalida;
        reparto.SIN_LIGAR.importe += m ? kmSinSalida * m.tarifa.total : 0;

        if (m) {
          // El plan corre desde que se compró, y en el mes en curso solo hasta hoy.
          const compra = v.espec?.fechaCompra ? new Date(v.espec.fechaCompra) : desde;
          const inicio = compra > desde ? compra : desde;
          const fin = hoy < hasta ? hoy : hasta;
          const fraccion = Math.max(0, fin.getTime() - inicio.getTime()) / (365 * DIA_MS);
          parado += costoParado(m.tarifa, m.ficha.unidadesAnio, Math.max(km, kmConSalida), fraccion).importe;
        }

        if (proximo?.estado === 'VENCIDO') {
          avisos.push({
            tono: 'danger',
            titulo: `${v.asset.nombre}: servicio vencido`,
            texto:
              proximo.faltanKm != null && proximo.faltanKm < 0
                ? `Pasó por ${Math.abs(proximo.faltanKm).toLocaleString('es-MX')} km: ${proximo.conceptos.join(', ')}.`
                : `Se pasó de fecha: ${proximo.conceptos.join(', ')}.`,
            vehicleId: v.asset.id,
          });
        } else if (proximo?.estado === 'PRONTO') {
          avisos.push({
            tono: 'warning',
            titulo: `${v.asset.nombre}: servicio próximo`,
            texto: proximo.conceptos.join(', '),
            vehicleId: v.asset.id,
          });
        }
        for (const d of v.documentos) {
          const estado = estadoDocumento(d.venceEl, hoy);
          if (estado === 'VENCIDO' || estado === 'PRONTO') {
            avisos.push({
              tono: estado === 'VENCIDO' ? 'danger' : 'warning',
              titulo: `${v.asset.nombre}: ${d.nombre} ${estado === 'VENCIDO' ? 'vencido' : 'por vencer'}`,
              texto: `Vence el ${new Date(d.venceEl).toISOString().slice(0, 10)}.`,
              vehicleId: v.asset.id,
            });
          }
        }
        const sinFoto = v.controles.filter(delMes).filter((c) => !c.fotoTableroDevolucionUrl).length;
        if (sinFoto) {
          avisos.push({
            tono: 'warning',
            titulo: `${v.asset.nombre}: ${sinFoto === 1 ? '1 salida' : `${sinFoto} salidas`} sin foto del tablero`,
            texto: 'Sin foto no hay kilómetros firmes.',
            vehicleId: v.asset.id,
          });
        }
        if (kmSinSalida > 0) {
          avisos.push({
            tono: 'warning',
            titulo: `${v.asset.nombre}: ${kmSinSalida.toLocaleString('es-MX')} km sin salida`,
            texto: 'El odómetro avanzó y nadie registró a qué trabajo fue.',
            vehicleId: v.asset.id,
          });
        }
        if (!v.espec) {
          avisos.push({
            tono: 'info',
            titulo: `${v.asset.nombre}: sin ficha`,
            texto: 'Súbele el manual y sus datos para sacarle costo y programa de servicio.',
            vehicleId: v.asset.id,
          });
        }

        return {
          id: v.asset.id,
          kmDelMes: km,
          porKm: veCostos && m ? m.tarifa.total : null,
          rendimientoReal: rendimiento.real,
          rendimientoOficial: rendimiento.oficial,
          proximoServicio: proximo,
          tieneFicha: Boolean(v.espec),
        };
      });

    const redondeado = (r: { km: number; importe: number }) => ({ km: Math.round(r.km), importe: veCostos ? redondear(r.importe) : null });
    const totalKm = Object.values(reparto).reduce((a, r) => a + r.km, 0);
    const totalUso = Object.values(reparto).reduce((a, r) => a + r.importe, 0);
    const costoMes = totalUso + parado;
    const orden = { danger: 0, warning: 1, info: 2 };
    return {
      mes: periodo,
      vehiculos,
      reparto: {
        proyectos: redondeado(reparto.PROYECTO),
        cotizaciones: redondeado(reparto.COTIZACION),
        oficina: redondeado(reparto.OFICINA),
        sinLigar: redondeado(reparto.SIN_LIGAR),
        parado: veCostos ? redondear(parado) : null,
      },
      resumen: {
        km: Math.round(totalKm),
        costoMes: veCostos ? redondear(costoMes) : null,
        porKm: veCostos && totalKm > 0 ? redondear(totalUso / totalKm) : null,
        aIndirectos: veCostos ? redondear(reparto.OFICINA.importe + parado) : null,
      },
      avisos: avisos.sort((a, b) => orden[a.tono] - orden[b.tono]),
      acceso: { veCostos },
    };
  }

  /* ── Alta y edición ─────────────────────────────────────────────────────── */

  private datosEspecificacion(d: DatosFichaVehiculo) {
    return {
      marca: texto(d.marca, 60),
      modelo: texto(d.modelo, 80),
      anio: d.anio,
      version: texto(d.version, 80),
      numeroSerie: texto(d.numeroSerie, 30),
      motor: texto(d.motor, 80),
      potenciaHp: d.potenciaHp,
      transmision: texto(d.transmision, 40),
      combustible: texto(d.combustible, 40),
      tanqueLitros: d.tanqueLitros,
      aceiteTipo: texto(d.aceiteTipo, 40),
      aceiteLitros: d.aceiteLitros,
      llantaMedida: texto(d.llantaMedida, 30),
      llantaPsi: d.llantaPsi,
      cargaKg: d.cargaKg,
      rendimientoOficial: d.rendimientoOficial,
      fechaCompra: d.fechaCompra === undefined ? undefined : fechaColumna(d.fechaCompra),
      odometroCompra: d.odometroCompra,
      odometroAlta: d.odometroAlta,
      fuentes: (d.fuentes ?? undefined) as any,
    };
  }

  private async guardarCosto(tx: any, companyId: number, vehicleId: number, nombre: string, c: CostoFichaDatos, actorId: number | null) {
    const parametros = await this.tarifas.parametros(companyId, Number(workDateKey(new Date()).slice(0, 4)));
    const existente = await tx.costoFichaEquipo.findFirst({ where: { companyId, tipo: 'VEHICULO', vehicleId, activo: true } });
    const estandar = await this.estandar(companyId);
    const conPrevio = <K extends keyof typeof OMISIONES_COSTO>(campo: K, columna: string, omision: number = estandar[campo]) =>
      c[campo] ?? (existente?.[columna] != null ? numero(existente[columna]) : omision);
    const valor = c.valor ?? (existente ? numero(existente.valor) : 0);
    if (!(valor > 0)) throw new BadRequestException('Falta el precio de compra para sacarle costo');
    const datos = {
      nombre: nombre.slice(0, 120),
      unidad: 'KM',
      valor,
      valorLlantas: conPrevio('valorLlantas', 'valorLlantas'),
      rescatePct: conPrevio('rescatePct', 'rescatePct'),
      vidaUnidades: conPrevio('vidaKm', 'vidaUnidades'),
      unidadesAnio: conPrevio('kmAnio', 'unidadesAnio'),
      tasaInteres: conPrevio('tasaInteres', 'tasaInteres', parametros.tasaInteres ?? estandar.tasaInteres),
      primaSeguro: conPrevio('primaSeguro', 'primaSeguro'),
      ko: conPrevio('ko', 'ko'),
      precioCombustible: conPrevio('precioCombustible', 'precioCombustible'),
      costoAceite: conPrevio('costoAceite', 'costoAceite'),
      aceiteCadaUnidades: conPrevio('aceiteCadaKm', 'aceiteCadaUnidades'),
      vidaLlantasUnidades: conPrevio('vidaLlantasKm', 'vidaLlantasUnidades'),
      otrosAnuales: conPrevio('otrosAnuales', 'otrosAnuales'),
      actualizadoPorId: actorId,
    };
    if (!(datos.vidaUnidades > 0) || !(datos.unidadesAnio > 0)) throw new BadRequestException('Falta la vida útil o los km al año');
    if (existente) await tx.costoFichaEquipo.update({ where: { id: existente.id }, data: datos });
    else await tx.costoFichaEquipo.create({ data: { ...datos, companyId, tipo: 'VEHICULO', vehicleId } });
  }

  private validarUrlSubida(url: string | null | undefined) {
    if (url && !url.startsWith(RUTA_SUBIDAS)) throw new BadRequestException('Ese archivo no se subió aquí');
  }

  /** Alta (`id` null) o edición: vehículo, ficha, programa, costo y manual, todo o nada. */
  async guardar(
    companyId: number | null,
    id: number | null,
    d: DatosFichaVehiculo,
    actor: ActorCostos,
    opciones: { recostear?: boolean } = {},
  ) {
    const tenantId = requireCompanyId(companyId);
    if (d.costo && !veTodoCostos(actor)) throw new ForbiddenException('El costo lo captura dirección o contabilidad');
    if (id != null) {
      const previo = await this.prisma.vehicleAsset.findFirst({ where: { id, companyId: tenantId }, select: { id: true } });
      if (!previo) throw new NotFoundException('Vehículo no encontrado');
    }
    this.validarUrlSubida(d.manual?.url);

    const nombreCalculado = [d.marca, d.modelo, d.anio].filter(Boolean).join(' ').trim();
    const nombre = (d.nombre ?? '').trim() || nombreCalculado;
    if (id == null && !nombre) throw new BadRequestException('Escribe la marca y el modelo del vehículo');
    const actorId = actor.id ?? null;

    const vehicleId = await this.prisma.$transaction(async (tx: any) => {
      let asset: { id: number; nombre: string };
      if (id == null) {
        asset = await tx.vehicleAsset.create({
          data: { nombre: nombre.slice(0, 100), placas: texto(d.placas, 20), notas: texto(d.notas, 500), estatus: 'Disponible', companyId: tenantId },
        });
      } else {
        asset = await tx.vehicleAsset.update({
          where: { id },
          data: {
            ...(d.nombre?.trim() ? { nombre: d.nombre.trim().slice(0, 100) } : {}),
            ...(d.placas !== undefined ? { placas: texto(d.placas, 20) } : {}),
          },
        });
      }
      const espec = this.datosEspecificacion(d);
      await tx.vehiculoEspecificacion.upsert({
        where: { vehicleId: asset.id },
        create: { ...espec, companyId: tenantId, vehicleId: asset.id, actualizadoPorId: actorId },
        update: { ...espec, actualizadoPorId: actorId },
      });
      if (d.plan) await this.reemplazarPlan(tx, tenantId, asset.id, d.plan);
      if (d.manual) {
        await tx.vehiculoDocumento.create({
          data: {
            companyId: tenantId,
            vehicleId: asset.id,
            tipo: 'MANUAL',
            nombre: String(d.manual.nombre || 'Manual del propietario').slice(0, 160),
            url: d.manual.url,
            paginas: d.manual.paginas ?? null,
            creadoPorId: actorId,
          },
        });
      }
      if (d.costo) await this.guardarCosto(tx, tenantId, asset.id, asset.nombre, d.costo, actorId);
      return asset.id;
    });

    if (opciones.recostear) await this.libro.sincronizar(tenantId, { vehicleId });
    return this.ficha(tenantId, vehicleId, actor);
  }

  /** Lo que ya no viene se apaga en vez de borrarse: los servicios hechos lo siguen citando. */
  private async reemplazarPlan(tx: any, companyId: number, vehicleId: number, plan: ReadonlyArray<DatosPlan>) {
    const actuales = await tx.vehiculoServicioPlan.findMany({ where: { companyId, vehicleId }, select: { id: true } });
    const ids = new Set(actuales.map((p: { id: number }) => p.id));
    const conservados = new Set<number>();
    for (const [orden, p] of plan.entries()) {
      const concepto = String(p.concepto ?? '').trim().slice(0, 120);
      if (!concepto) continue;
      if (p.cadaKm == null && p.cadaMeses == null) throw new BadRequestException(`A «${concepto}» le falta cada cuánto toca`);
      const datos = {
        concepto,
        cadaKm: p.cadaKm ?? null,
        cadaMeses: p.cadaMeses ?? null,
        costoEstimado: p.costoEstimado ?? null,
        paginaManual: p.paginaManual ?? null,
        orden,
        activo: true,
      };
      if (p.id != null && ids.has(p.id)) {
        conservados.add(p.id);
        await tx.vehiculoServicioPlan.update({ where: { id: p.id }, data: datos });
      } else {
        await tx.vehiculoServicioPlan.create({ data: { ...datos, companyId, vehicleId } });
      }
    }
    const apagar = [...ids].filter((i) => !conservados.has(i as number)) as number[];
    if (apagar.length) await tx.vehiculoServicioPlan.updateMany({ where: { id: { in: apagar } }, data: { activo: false } });
  }

  private async exigirVehiculo(companyId: number, id: number) {
    const fila = await this.prisma.vehicleAsset.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!fila) throw new NotFoundException('Vehículo no encontrado');
  }

  async guardarPlan(companyId: number | null, id: number, plan: ReadonlyArray<DatosPlan>, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    await this.exigirVehiculo(tenantId, id);
    await this.prisma.$transaction((tx: any) => this.reemplazarPlan(tx, tenantId, id, plan));
    return this.ficha(tenantId, id, actor);
  }

  /* ── Servicios ──────────────────────────────────────────────────────────── */

  async registrarServicio(companyId: number | null, id: number, d: DatosServicio, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    await this.exigirVehiculo(tenantId, id);
    const concepto = String(d.concepto ?? '').trim().slice(0, 200);
    if (!concepto) throw new BadRequestException('Escribe qué se le hizo');
    const fecha = fechaColumna(d.fecha);
    if (!fecha) throw new BadRequestException('Falta la fecha del servicio');
    if (d.odometro != null && d.odometro < 0) throw new BadRequestException('Odómetro inválido');
    if (d.costo != null && d.costo < 0) throw new BadRequestException('El costo no puede ser negativo');
    this.validarUrlSubida(d.comprobanteUrl);
    const planIds = [...new Set(d.planIds ?? [])];
    if (planIds.length) {
      const validos = await this.prisma.vehiculoServicioPlan.count({ where: { companyId: tenantId, vehicleId: id, id: { in: planIds } } });
      if (validos !== planIds.length) throw new BadRequestException('Ese concepto no es del programa de este vehículo');
    }
    await this.prisma.vehiculoServicio.create({
      data: {
        companyId: tenantId,
        vehicleId: id,
        fecha,
        odometro: d.odometro ?? null,
        concepto,
        costo: d.costo ?? 0,
        proveedor: texto(d.proveedor, 120) ?? null,
        notas: texto(d.notas, 300) ?? null,
        comprobanteUrl: d.comprobanteUrl ?? null,
        planIds,
        registradoPorId: actor.id ?? null,
      },
    });
    return this.ficha(tenantId, id, actor);
  }

  async quitarServicio(companyId: number | null, id: number, servicioId: number, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.vehiculoServicio.findFirst({ where: { id: servicioId, companyId: tenantId, vehicleId: id } });
    if (!fila) throw new NotFoundException('Servicio no encontrado');
    await this.prisma.vehiculoServicio.delete({ where: { id: servicioId } });
    return this.ficha(tenantId, id, actor);
  }

  /* ── Gasolina ───────────────────────────────────────────────────────────── */

  async registrarCarga(companyId: number | null, id: number, d: DatosCarga, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const v = (await this.leer(tenantId, [id])).get(id);
    if (!v) throw new NotFoundException('Vehículo no encontrado');
    if (!Number.isInteger(d.odometro) || d.odometro < 0) throw new BadRequestException('Escribe el odómetro en km');
    if (!(d.litros > 0) || d.litros > 400) throw new BadRequestException('Los litros no cuadran');
    if (!(d.importe > 0) || d.importe > 25000) throw new BadRequestException('El importe no cuadra');
    this.validarUrlSubida(d.ticketUrl);
    this.validarUrlSubida(d.tableroUrl);

    // Una carga de hoy no puede traer menos km que lo último leído. Una vieja que se captura tarde, sí.
    const fecha = d.fecha ? new Date(d.fecha) : new Date();
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('Fecha inválida');
    if (fecha.getTime() > Date.now() + DIA_MS) throw new BadRequestException('La fecha no puede ser futura');
    const vigente = odometroVigente(this.lecturas(v));
    if (!d.fecha && vigente && d.odometro < vigente.km) {
      throw new BadRequestException(`El odómetro no puede ser menor que el último leído: ${vigente.km.toLocaleString('es-MX')} km`);
    }

    await this.prisma.vehiculoCarga.create({
      data: {
        companyId: tenantId,
        vehicleId: id,
        fecha,
        odometro: d.odometro,
        litros: d.litros,
        importe: d.importe,
        tanqueLleno: d.tanqueLleno,
        ticketUrl: d.ticketUrl ?? null,
        tableroUrl: d.tableroUrl ?? null,
        registradoPorId: actor.id ?? null,
      },
    });
    return this.ficha(tenantId, id, actor);
  }

  async quitarCarga(companyId: number | null, id: number, cargaId: number, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.vehiculoCarga.findFirst({ where: { id: cargaId, companyId: tenantId, vehicleId: id } });
    if (!fila) throw new NotFoundException('Carga no encontrada');
    await this.prisma.vehiculoCarga.delete({ where: { id: cargaId } });
    return this.ficha(tenantId, id, actor);
  }

  /* ── Documentos ─────────────────────────────────────────────────────────── */

  async agregarDocumento(
    companyId: number | null,
    id: number,
    d: { tipo: string; nombre: string; url: string; paginas?: number | null; venceEl?: string | null },
    actor: ActorCostos,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.exigirVehiculo(tenantId, id);
    if (!(TIPOS_DOCUMENTO as readonly string[]).includes(d.tipo)) throw new BadRequestException('Tipo de documento inválido');
    this.validarUrlSubida(d.url);
    await this.prisma.vehiculoDocumento.create({
      data: {
        companyId: tenantId,
        vehicleId: id,
        tipo: d.tipo,
        nombre: String(d.nombre || d.tipo).trim().slice(0, 160),
        url: d.url,
        paginas: d.paginas ?? null,
        venceEl: fechaColumna(d.venceEl),
        creadoPorId: actor.id ?? null,
      },
    });
    return this.ficha(tenantId, id, actor);
  }

  async editarDocumento(
    companyId: number | null,
    id: number,
    documentoId: number,
    d: { nombre?: string; venceEl?: string | null },
    actor: ActorCostos,
  ) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.vehiculoDocumento.findFirst({ where: { id: documentoId, companyId: tenantId, vehicleId: id } });
    if (!fila) throw new NotFoundException('Documento no encontrado');
    await this.prisma.vehiculoDocumento.update({
      where: { id: documentoId },
      data: {
        ...(d.nombre?.trim() ? { nombre: d.nombre.trim().slice(0, 160) } : {}),
        ...(d.venceEl !== undefined ? { venceEl: fechaColumna(d.venceEl) } : {}),
      },
    });
    return this.ficha(tenantId, id, actor);
  }

  async quitarDocumento(companyId: number | null, id: number, documentoId: number, actor: ActorCostos) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.vehiculoDocumento.findFirst({ where: { id: documentoId, companyId: tenantId, vehicleId: id } });
    if (!fila) throw new NotFoundException('Documento no encontrado');
    await this.prisma.vehiculoDocumento.delete({ where: { id: documentoId } });
    return this.ficha(tenantId, id, actor);
  }
}
