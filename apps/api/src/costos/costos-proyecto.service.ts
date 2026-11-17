import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateKey } from '../common/time/workday.js';
import { numero, redondear } from './calculos/numeros.js';
import {
  RUBROS,
  cotizadoPorRubro,
  margen,
  rubrosEnCero,
  sumaDe,
  sumarPorRubro,
  ventaSinIva,
  type DetalleViaje,
  type Rubro,
  type TotalesRubro,
} from './calculos/libro-costos.js';
import { puedeLigarHoras, veTodoCostos, type ActorCostos } from './costos-acceso.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { categoriaPorPuesto } from './categorias-base.js';
import { evaluarCompletitud } from '../projects/proyecto-completitud.js';
import { calcularSalud } from '../projects/proyecto-salud.js';
import { esNombreDeRelleno } from '../ventas/client-sectors.js';
import { estimarCostoAlTerminar } from './calculos/costo-al-terminar.js';
import { LibroCostosService } from './libro-costos.service.js';
import { leerPaginasCostos } from './calculos/paginar-costos.js';

export const ETIQUETA_RUBRO: Record<Rubro, string> = {
  MATERIAL: 'Equipos y material',
  MANO_OBRA: 'Mano de obra',
  VEHICULO: 'Vehículos',
  HERRAMIENTA: 'Herramienta',
  VIATICO_GASTO: 'Viáticos y gastos',
  SUBCONTRATO: 'Subcontratos',
};

const SELECCION_COTIZACION = {
  id: true,
  quoteNumber: true,
  subtotal: true,
  discountTotal: true,
  marginPercent: true,
  items: {
    select: {
      grupo: true,
      category: true,
      name: true,
      description: true,
      unit: true,
      qty: true,
      unitPrice: true,
      unitCost: true,
      laborHours: true,
      laborRate: true,
      lineTotal: true,
    },
  },
} as const;

/** Partidas de Prisma (con `Decimal`) a números para el agrupador. */
function partidasDe(items: ReadonlyArray<Record<string, any>>) {
  return items.map((i) => ({
    ...i,
    unitPrice: numero(i.unitPrice),
    laborHours: numero(i.laborHours),
    laborRate: numero(i.laborRate),
    lineTotal: numero(i.lineTotal),
  }));
}

@Injectable()
export class CostosProyectoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tarifas: CostosTarifasService,
    @Optional() private readonly libro?: LibroCostosService,
  ) {}

  /** Material al costo de salida: se lee en vivo sin escribir ni duplicar el libro. */
  private async materialDirecto(companyId: number, projectId?: number, activityIds: number[] = []) {
    const consulta = {
      where: { companyId, ...(projectId != null ? { OR: [{ activityId: null, projectId }, { activityId: { in: activityIds } }] } : {}), type: { in: ['DISPATCH', 'RETURN'] as Array<'DISPATCH' | 'RETURN'> } },
      select: { id: true, activityId: true, projectId: true, type: true, quantity: true, unitCost: true, totalCost: true, createdAt: true, notes: true },
      orderBy: { id: 'asc' },
      take: 500,
    } as const;
    const salidas = await this.prisma.stockMovement.findMany(consulta);
    let ultimaPagina = salidas;
    while (ultimaPagina.length === 500) {
      ultimaPagina = await this.prisma.stockMovement.findMany({ ...consulta, cursor: { id: ultimaPagina[ultimaPagina.length - 1].id }, skip: 1 });
      salidas.push(...ultimaPagina);
    }
    return salidas.map((s) => {
      const signo = s.type === 'RETURN' ? -1 : 1;
      return {
        origen: `SALIDA:${s.id}`, projectId: s.projectId, rubro: 'MATERIAL' as const,
        importe: redondear(signo * (numero(s.totalCost) || numero(s.quantity) * numero(s.unitCost))),
        cantidad: signo * numero(s.quantity), unidad: 'pza', userId: null,
        nota: numero(s.totalCost) === 0 && numero(s.unitCost) === 0 ? 'Salida sin costo: vale cero' : s.notes, fecha: s.createdAt, activityId: s.activityId, detalle: null,
      };
    });
  }

  /** Qué actividades se le cargan a cada proyecto: las suyas, las de su cotización y las ligadas a mano. */
  private async mapaDeActividades(companyId: number) {
    const [ligas, actividades, proyectos] = await Promise.all([
      leerPaginasCostos((skip) => this.prisma.costoActividadLiga.findMany({ skip, take: 500, orderBy: { id: 'asc' }, where: { companyId, tipo: { not: null } } })),
      leerPaginasCostos((skip) => this.prisma.activity.findMany({
        skip, take: 500, orderBy: { id: 'asc' },
        where: { companyId, deletedAt: null, OR: [{ projectId: { not: null } }, { cotizacionId: { not: null } }] },
        select: { id: true, projectId: true, cotizacionId: true },
      })),
      leerPaginasCostos((skip) => this.prisma.operationalProject.findMany({ skip, take: 500, orderBy: { id: 'asc' }, where: { companyId, deletedAt: null }, select: { id: true, cotizacionId: true } })),
    ]);
    const proyectoDeCotizacion = new Map(proyectos.filter((p) => p.cotizacionId).map((p) => [p.cotizacionId!, p.id]));

    const deProyecto = new Map<number, Set<number>>();
    const deCotizacion = new Map<number, Set<number>>();
    const internas = new Set<number>();
    const agregar = (mapa: Map<number, Set<number>>, clave: number, activityId: number) => {
      const c = mapa.get(clave) ?? new Set<number>();
      c.add(activityId);
      mapa.set(clave, c);
    };
    const anclar = (activityId: number, proyectoId: number | null, cotizacionId: number | null) => {
      const proyecto = proyectoId ?? (cotizacionId ? proyectoDeCotizacion.get(cotizacionId) : undefined);
      if (proyecto) agregar(deProyecto, proyecto, activityId);
      else if (cotizacionId) agregar(deCotizacion, cotizacionId, activityId);
    };
    const manuales = ligas.filter((l) => l.tipo != null);
    const conDecisionManual = new Set(manuales.map((l) => l.activityId));
    for (const a of actividades) {
      if (!conDecisionManual.has(a.id)) anclar(a.id, a.projectId, a.cotizacionId);
    }
    for (const l of manuales) {
      if (l.tipo === 'INTERNA') internas.add(l.activityId);
      else anclar(l.activityId, l.proyectoId, l.cotizacionId);
    }
    return { deProyecto, deCotizacion, internas };
  }

  /** Lista para CEO y contadora: cuánto va costando cada proyecto y qué queda sin ligar. */
  async lista(companyId: number | null, actor: ActorCostos, soloResumen = false) {
    const veTodo = veTodoCostos(actor);
    const coordina = puedeLigarHoras(actor);
    if (!soloResumen && !veTodo) throw new ForbiddenException('Solo dirección y contabilidad ven los costos de todos');
    if (!veTodo && !coordina && !actor.id) throw new ForbiddenException('Los costos de proyectos no están disponibles para tu perfil');
    const tenantId = requireCompanyId(companyId);
    const [mapa, movimientos, proyectos, material, parametros] = await Promise.all([
      this.mapaDeActividades(tenantId),
      this.libro ? this.libro.leer(tenantId).then((filas) => filas.filter((m) => m.rubro !== 'MATERIAL').map((m) => ({ activityId: m.activityId, rubro: m.rubro, _sum: { importe: m.importe, cantidad: m.cantidad } }))) : this.prisma.costoMovimiento.groupBy({
        by: ['activityId', 'rubro'],
        where: { companyId: tenantId, rubro: { not: 'MATERIAL' } },
        _sum: { importe: true, cantidad: true },
      }),
      leerPaginasCostos((skip) => this.prisma.operationalProject.findMany({
        skip, take: 500,
        where: { companyId: tenantId, deletedAt: null, status: { not: 'CANCELLED' },
          ...(!veTodo && !coordina ? { OR: [{ responsableId: actor.id! }, { vendorId: actor.id! }] } : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          budgetAmount: true,
          cotizacionId: true,
          client: { select: { name: true } },
          cotizacion: { select: SELECCION_COTIZACION },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })),
      this.materialDirecto(tenantId),
      this.tarifas.parametros(tenantId, Number(workDateKey(new Date()).slice(0, 4))),
    ]);

    const filasDe = (ids: Set<number> | undefined) =>
      ids ? movimientos.filter((m) => ids.has(m.activityId)).map((m) => ({ rubro: m.rubro, importe: m._sum.importe })) : [];
    const ligadas = new Set<number>(mapa.internas);
    for (const c of mapa.deProyecto.values()) for (const id of c) ligadas.add(id);
    for (const c of mapa.deCotizacion.values()) for (const id of c) ligadas.add(id);

    const filas = proyectos.map((p) => {
      const real = sumarPorRubro([...filasDe(mapa.deProyecto.get(p.id)), ...material.filter((m) => m.activityId != null ? mapa.deProyecto.get(p.id)?.has(m.activityId) : m.projectId === p.id)]);
      const venta = p.budgetAmount != null ? numero(p.budgetAmount) : p.cotizacion ? ventaSinIva(p.cotizacion) : null;
      const costo = redondear(sumaDe(real) * (1 + (parametros.indirectoPct ?? 0)));
      const cotizado = p.cotizacion ? sumaDe(cotizadoPorRubro(partidasDe(p.cotizacion.items)).porRubro) * (1 + (parametros.indirectoPct ?? 0)) : null;
      const margenReal = venta == null ? null : margen(venta, costo);
      const margenCotizado = venta != null && cotizado != null ? margen(venta, cotizado) : null;
      return {
        id: p.id,
        titulo: p.title,
        estado: p.status,
        cliente: p.client?.name ?? null,
        cotizacion: p.cotizacion?.quoteNumber ?? null,
        venta,
        costo,
        real,
        margen: margenReal,
        margenCotizado,
        semaforoMargen: margenReal?.pct == null ? null : margenReal.pct < 0 ? 'rojo' : margenCotizado?.pct == null ? null : margenReal.pct >= margenCotizado.pct - 5 ? 'verde' : 'ambar',
        sobrecosto: cotizado != null && costo > cotizado,
      };
    });

    const idsCotizacion = [...mapa.deCotizacion.keys()];
    const cotizaciones = idsCotizacion.length
      ? await this.prisma.cotizacion.findMany({
          where: { companyId: tenantId, id: { in: idsCotizacion } },
          select: { id: true, quoteNumber: true, projectName: true, clientCompany: true, clientName: true, salesClient: { select: { serviceClientId: true } } },
        })
      : [];

    const manoDeObra = movimientos.filter((m) => m.rubro === 'MANO_OBRA');
    const importe = (lista: typeof manoDeObra) => redondear(lista.reduce((a, m) => a + numero(m._sum.importe), 0));
    const horas = (lista: typeof manoDeObra) => redondear(lista.reduce((a, m) => a + numero(m._sum.cantidad), 0), 1);
    const sinLigar = manoDeObra.filter((m) => !ligadas.has(m.activityId));
    const internas = manoDeObra.filter((m) => mapa.internas.has(m.activityId));

    return {
      proyectos: filas,
      conSobrecosto: filas.filter((p) => p.sobrecosto).length,
      sinLigar: {
        etiqueta: 'Sin ligar',
        importe: veTodo ? redondear(material.filter((m) => m.projectId == null && m.activityId == null).reduce((total, m) => total + m.importe, 0)) : 0,
        movimientos: veTodo ? material.filter((m) => m.projectId == null && m.activityId == null).map((m) => ({ origen: m.origen, fecha: m.fecha.toISOString(), actividadId: null, cantidad: m.cantidad, unidad: m.unidad, importe: m.importe, nota: m.nota })) : [],
      },
      cotizacionesSinProyecto: (veTodo ? cotizaciones : []).map((c) => {
        const real = sumarPorRubro([
          ...filasDe(mapa.deCotizacion.get(c.id)),
          ...material.filter((m) => m.activityId != null && mapa.deCotizacion.get(c.id)?.has(m.activityId)),
        ]);
        return {
          id: c.id,
          folio: c.quoteNumber,
          nombre: c.projectName || c.clientCompany || c.clientName || c.quoteNumber,
          clienteId: c.salesClient?.serviceClientId ?? null,
          costo: sumaDe(real),
          real,
        };
      }),
      manoDeObra: {
        horas: veTodo ? horas(manoDeObra) : 0,
        importe: veTodo ? importe(manoDeObra) : 0,
        horasSinLigar: veTodo ? horas(sinLigar) : 0,
        importeSinLigar: veTodo ? importe(sinLigar) : 0,
        horasInternas: veTodo ? horas(internas) : 0,
        importeInterno: veTodo ? importe(internas) : 0,
      },
    };
  }

  /** Contexto de una ejecución: el cron reutiliza la misma lectura por empresa, sin caché persistente. */
  async contextoLectura(companyId: number) {
    const tenantId = requireCompanyId(companyId);
    const [mapa, movimientos, material, parametros] = await Promise.all([
      this.mapaDeActividades(tenantId),
      this.libro ? this.libro.leer(tenantId) : leerPaginasCostos((skip) => this.prisma.costoMovimiento.findMany({ where: { companyId: tenantId }, skip, take: 500, orderBy: { id: 'asc' } })),
      this.materialDirecto(tenantId),
      this.tarifas.parametros(tenantId, Number(workDateKey(new Date()).slice(0, 4))),
    ]);
    return { companyId: tenantId, mapa, movimientos, material, parametros };
  }

  /** El detalle de un proyecto: la pestaña «Costos». */
  async proyecto(companyId: number | null, proyectoId: number, actor: ActorCostos,
    contexto?: Awaited<ReturnType<CostosProyectoService['contextoLectura']>>) {
    const tenantId = requireCompanyId(companyId);
    const p = await this.prisma.operationalProject.findFirst({
      where: { id: proyectoId, companyId: tenantId },
      select: {
        id: true,
        title: true,
        budgetAmount: true,
        cotizacionId: true,
        responsableId: true,
        vendorId: true,
        clientId: true,
        projectType: true,
        description: true,
        startDate: true,
        endDate: true,
        actualEndDate: true,
        status: true,
        client: { select: { name: true } },
        activities: { where: { deletedAt: null }, select: { estatus: true } },
        milestones: { select: { status: true, plannedDate: true, actualDate: true } },
        cotizacion: { select: SELECCION_COTIZACION },
      },
    });
    if (!p) throw new NotFoundException('Proyecto no encontrado');

    const veTodo = veTodoCostos(actor);
    const esDelProyecto = actor.id != null && (actor.id === p.responsableId || actor.id === p.vendorId);
    if (!veTodo && !esDelProyecto && !puedeLigarHoras(actor)) {
      throw new ForbiddenException('Los costos de este proyecto no están disponibles para tu perfil');
    }

    if (contexto && contexto.companyId !== tenantId) throw new ForbiddenException('El contexto de costos pertenece a otra empresa');
    const { deProyecto } = contexto?.mapa ?? await this.mapaDeActividades(tenantId);
    const ids = [...(deProyecto.get(p.id) ?? [])];
    const libro = contexto ? contexto.movimientos.filter((m) => ids.includes(m.activityId) && m.rubro !== 'MATERIAL') : this.libro ? (await this.libro.leer(tenantId)).filter((m) => ids.includes(m.activityId) && m.rubro !== 'MATERIAL') : ids.length
      ? await leerPaginasCostos((skip) => this.prisma.costoMovimiento.findMany({
          skip, take: 500, orderBy: { id: 'asc' },
          where: { companyId: tenantId, activityId: { in: ids }, rubro: { not: 'MATERIAL' } },
          select: {
            origen: true,
            rubro: true,
            importe: true,
            cantidad: true,
            unidad: true,
            userId: true,
            nota: true,
            fecha: true,
            activityId: true,
            detalle: true,
          },
        }))
      : [];

    const material = contexto ? contexto.material.filter((m) => m.activityId != null ? ids.includes(m.activityId) : m.projectId === p.id) : await this.materialDirecto(tenantId, p.id, ids);
    const filas = [...libro, ...material];
    const ficha = evaluarCompletitud({ ...p, clientName: p.client?.name, clientEsRelleno: esNombreDeRelleno(p.client?.name) });
    const salud = calcularSalud({ ...p, actividades: p.activities, hitos: p.milestones, fichaCompleta: ficha.fichaOk });

    const real: TotalesRubro = sumarPorRubro(filas);
    const cotizado = p.cotizacion ? cotizadoPorRubro(partidasDe(p.cotizacion.items)) : null;
    const porRubroCotizado = cotizado?.porRubro ?? rubrosEnCero();
    const directoCotizado = cotizado ? sumaDe(porRubroCotizado) : null;
    const directoReal = sumaDe(real);

    const parametros = contexto?.parametros ?? await this.tarifas.parametros(tenantId, Number(workDateKey(new Date()).slice(0, 4)));
    const pct = parametros.indirectoPct;
    const indirectoCotizado = pct != null && directoCotizado != null ? redondear(directoCotizado * pct) : null;
    const indirectoReal = pct != null ? redondear(directoReal * pct) : null;

    const venta = p.budgetAmount != null ? numero(p.budgetAmount) : p.cotizacion ? ventaSinIva(p.cotizacion) : null;
    const margenCotizado =
      venta != null && directoCotizado != null ? margen(venta, directoCotizado + (indirectoCotizado ?? 0)) : null;
    const margenHoy = venta != null ? margen(venta, directoReal + (indirectoReal ?? 0)) : null;

    const manoDeObra = filas.filter((f) => f.rubro === 'MANO_OBRA');
    const horas = redondear(manoDeObra.reduce((a, f) => a + numero(f.cantidad), 0), 1);
    const sinSueldo = manoDeObra.filter((f) => /Sin sueldo/.test(f.nota ?? '')).length;
    const recortadas = manoDeObra.filter((f) => /Cierre automático/.test(f.nota ?? '')).length;
    const sinCosto = filas.filter((f) => /sin costo/i.test(f.nota ?? '')).length;

    return {
      proyecto: { id: p.id, titulo: p.title, cotizacion: p.cotizacion?.quoteNumber ?? null, cotizacionId: p.cotizacionId },
      venta,
      costoReal: redondear(directoReal + (indirectoReal ?? 0)),
      avance: salud.avance.porcentaje,
      costoAlTerminar: estimarCostoAlTerminar(directoReal + (indirectoReal ?? 0), salud.avance.porcentaje, !ficha.fichaOk),
      rubros: RUBROS.map((r) => ({
        rubro: r,
        etiqueta: ETIQUETA_RUBRO[r],
        cotizado: cotizado ? porRubroCotizado[r] : null,
        real: real[r],
        diferencia: cotizado ? redondear(real[r] - porRubroCotizado[r]) : null,
        consumidoPct: cotizado && porRubroCotizado[r] > 0 ? redondear(real[r] / porRubroCotizado[r] * 100, 1) : null,
        movimientos: r === 'MANO_OBRA' && !veTodo ? [] : filas.filter((f) => f.rubro === r).map((f) => ({
          origen: f.origen, fecha: f.fecha.toISOString(), actividadId: f.activityId,
          cantidad: numero(f.cantidad), unidad: f.unidad, importe: numero(f.importe), nota: f.nota,
        })),
      })),
      directo: { cotizado: directoCotizado, real: directoReal },
      indirecto: { pct, cotizado: indirectoCotizado, real: indirectoReal },
      margen: { cotizado: margenCotizado, hoy: margenHoy },
      manoDeObra: {
        horas,
        // Por categoría solo con permiso: con una sola persona, el importe delataría su sueldo.
        categorias: veTodo ? await this.manoDeObraPorCategoria(tenantId, manoDeObra) : null,
      },
      avisos: {
        sinCotizacion: !p.cotizacion,
        sinVenta: venta == null,
        partidasSinCosto: cotizado?.partidasSinCosto ?? 0,
        partidas: cotizado?.partidas ?? 0,
        indirectoSinCapturar: pct == null,
        sesionesSinSueldo: sinSueldo,
        sesionesRecortadas: recortadas,
        salidasSinCosto: sinCosto,
        psSinValidar: !parametros.psValidado,
      },
      vehiculos: await this.vehiculosDelProyecto(tenantId, filas),
      acceso: { detalle: veTodo },
    };
  }

  /** Los viajes del proyecto y de qué se compone lo que costaron. */
  private async vehiculosDelProyecto(
    companyId: number,
    filas: ReadonlyArray<{ rubro: string; unidad: string; cantidad: unknown; importe: unknown; fecha: Date; activityId: number | null; detalle?: unknown }>,
  ) {
    const delRubro = filas.filter((f) => f.rubro === 'VEHICULO');
    const viajes = delRubro.filter((f) => f.unidad === 'km');
    const vehiculoIds = [...new Set(viajes.map((f) => (f.detalle as DetalleViaje | null)?.vehicleId).filter((x): x is number => x != null))];
    const [vehiculos, actividades] = await Promise.all([
      vehiculoIds.length
        ? this.prisma.vehicleAsset.findMany({ where: { companyId, id: { in: vehiculoIds } }, select: { id: true, nombre: true } })
        : Promise.resolve([] as Array<{ id: number; nombre: string }>),
      viajes.length
        ? this.prisma.activity.findMany({
            where: { companyId, id: { in: [...new Set(viajes.map((f) => f.activityId).filter((id): id is number => id != null))] } },
            select: { id: true, titulo: true },
          })
        : Promise.resolve([] as Array<{ id: number; titulo: string }>),
    ]);
    const nombreDe = new Map(vehiculos.map((v) => [v.id, v.nombre]));
    const tituloDe = new Map(actividades.map((a) => [a.id, a.titulo]));
    const partes = new Map<string, number>();
    for (const f of viajes) {
      const d = f.detalle as DetalleViaje | null;
      for (const [clave, porKm] of Object.entries(d?.tarifa ?? {})) {
        partes.set(clave, (partes.get(clave) ?? 0) + numero(porKm) * numero(f.cantidad));
      }
    }
    const importeViajes = viajes.reduce((a, f) => a + numero(f.importe), 0);
    return {
      km: Math.round(viajes.reduce((a, f) => a + numero(f.cantidad), 0)),
      importe: redondear(importeViajes),
      /** Casetas y gasolina sin vehículo: lo que entró directo, sin pasar por los km. */
      otros: redondear(delRubro.filter((f) => f.unidad !== 'km').reduce((a, f) => a + numero(f.importe), 0)),
      viajes: viajes
        .map((f) => {
          const d = f.detalle as DetalleViaje | null;
          return {
            fecha: new Date(f.fecha).toISOString().slice(0, 10),
            actividad: f.activityId != null ? tituloDe.get(f.activityId) ?? null : null,
            vehiculo: d?.vehicleId != null ? (nombreDe.get(d.vehicleId) ?? null) : null,
            km: Math.round(numero(f.cantidad)),
            importe: redondear(numero(f.importe)),
          };
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      desglose: [
        ['co', 'gasolina'],
        ['d', 'desgaste'],
        ['im', 'dinero invertido'],
        ['mn', 'mantenimiento'],
        ['sm', 'seguro'],
        ['n', 'llantas'],
        ['lb', 'aceite'],
        ['otros', 'tenencia y verificación'],
      ]
        .map(([clave, nombre]) => ({ nombre, importe: redondear(partes.get(clave) ?? 0) }))
        .filter((p) => p.importe > 0),
    };
  }

  private async manoDeObraPorCategoria(
    companyId: number,
    filas: ReadonlyArray<{ userId: number | null; cantidad: unknown; importe: unknown }>,
  ) {
    const userIds = [...new Set(filas.map((f) => f.userId).filter((x): x is number => x != null))];
    if (!userIds.length) return [];
    const [personas, propias, categorias] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, puesto: true } }),
      this.prisma.costoPersona.findMany({ where: { companyId, userId: { in: userIds } } }),
      this.prisma.costoCategoria.findMany({ where: { companyId } }),
    ]);
    const porId = new Map(categorias.map((c) => [c.id, c.nombre]));
    const porClave = new Map(categorias.map((c) => [c.clave, c.nombre]));
    const propiaDe = new Map(propias.map((c) => [c.userId, c.categoriaId]));
    const nombreDe = new Map(
      personas.map((u) => {
        const propia = propiaDe.get(u.id);
        const nombre = (propia != null ? porId.get(propia) : porClave.get(categoriaPorPuesto(u.puesto) ?? '')) ?? 'Sin categoría';
        return [u.id, nombre];
      }),
    );
    const suma = new Map<string, { categoria: string; horas: number; importe: number }>();
    for (const f of filas) {
      const categoria = (f.userId != null ? nombreDe.get(f.userId) : null) ?? 'Sin categoría';
      const fila = suma.get(categoria) ?? { categoria, horas: 0, importe: 0 };
      fila.horas += numero(f.cantidad);
      fila.importe += numero(f.importe);
      suma.set(categoria, fila);
    }
    return [...suma.values()]
      .map((c) => ({ ...c, horas: redondear(c.horas, 1), importe: redondear(c.importe) }))
      .sort((a, b) => b.importe - a.importe);
  }
}
