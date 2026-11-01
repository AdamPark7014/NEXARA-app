import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  type Rubro,
  type TotalesRubro,
} from './calculos/libro-costos.js';
import { puedeLigarHoras, veTodoCostos, type ActorCostos } from './costos-acceso.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { categoriaPorPuesto } from './categorias-base.js';

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
  ) {}

  /** Qué actividades se le cargan a cada proyecto: las suyas, las de su cotización y las ligadas a mano. */
  private async mapaDeActividades(companyId: number) {
    const [ligas, actividades, proyectos] = await Promise.all([
      this.prisma.costoActividadLiga.findMany({ where: { companyId, tipo: { not: null } } }),
      this.prisma.activity.findMany({
        where: { companyId, deletedAt: null, OR: [{ projectId: { not: null } }, { cotizacionId: { not: null } }] },
        select: { id: true, projectId: true, cotizacionId: true },
      }),
      this.prisma.operationalProject.findMany({ where: { companyId }, select: { id: true, cotizacionId: true } }),
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
    for (const a of actividades) anclar(a.id, a.projectId, a.cotizacionId);
    for (const l of ligas) {
      if (l.tipo === 'INTERNA') internas.add(l.activityId);
      else anclar(l.activityId, l.proyectoId, l.cotizacionId);
    }
    return { deProyecto, deCotizacion, internas };
  }

  /** Lista para CEO y contadora: cuánto va costando cada proyecto y qué queda sin ligar. */
  async lista(companyId: number | null, actor: ActorCostos) {
    if (!veTodoCostos(actor)) throw new ForbiddenException('Solo dirección y contabilidad ven los costos de todos');
    const tenantId = requireCompanyId(companyId);
    const [mapa, movimientos, proyectos] = await Promise.all([
      this.mapaDeActividades(tenantId),
      this.prisma.costoMovimiento.groupBy({
        by: ['activityId', 'rubro'],
        where: { companyId: tenantId },
        _sum: { importe: true, cantidad: true },
      }),
      this.prisma.operationalProject.findMany({
        where: { companyId: tenantId, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          title: true,
          status: true,
          budgetAmount: true,
          cotizacionId: true,
          client: { select: { name: true } },
          cotizacion: { select: { quoteNumber: true, subtotal: true, discountTotal: true, marginPercent: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const filasDe = (ids: Set<number> | undefined) =>
      ids ? movimientos.filter((m) => ids.has(m.activityId)).map((m) => ({ rubro: m.rubro, importe: m._sum.importe })) : [];
    const ligadas = new Set<number>(mapa.internas);
    for (const c of mapa.deProyecto.values()) for (const id of c) ligadas.add(id);
    for (const c of mapa.deCotizacion.values()) for (const id of c) ligadas.add(id);

    const filas = proyectos.map((p) => {
      const real = sumarPorRubro(filasDe(mapa.deProyecto.get(p.id)));
      const venta = p.budgetAmount != null ? numero(p.budgetAmount) : p.cotizacion ? ventaSinIva(p.cotizacion) : null;
      const costo = sumaDe(real);
      return {
        id: p.id,
        titulo: p.title,
        estado: p.status,
        cliente: p.client?.name ?? null,
        cotizacion: p.cotizacion?.quoteNumber ?? null,
        venta,
        costo,
        real,
        margen: venta == null ? null : margen(venta, costo),
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
      cotizacionesSinProyecto: cotizaciones.map((c) => {
        const real = sumarPorRubro(filasDe(mapa.deCotizacion.get(c.id)));
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
        horas: horas(manoDeObra),
        importe: importe(manoDeObra),
        horasSinLigar: horas(sinLigar),
        importeSinLigar: importe(sinLigar),
        horasInternas: horas(internas),
        importeInterno: importe(internas),
      },
    };
  }

  /** El detalle de un proyecto: la pestaña «Costos». */
  async proyecto(companyId: number | null, proyectoId: number, actor: ActorCostos) {
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
        cotizacion: { select: SELECCION_COTIZACION },
      },
    });
    if (!p) throw new NotFoundException('Proyecto no encontrado');

    const veTodo = veTodoCostos(actor);
    const esDelProyecto = actor.id != null && (actor.id === p.responsableId || actor.id === p.vendorId);
    if (!veTodo && !esDelProyecto && !puedeLigarHoras(actor)) {
      throw new ForbiddenException('Los costos de este proyecto no están disponibles para tu perfil');
    }

    const { deProyecto } = await this.mapaDeActividades(tenantId);
    const ids = [...(deProyecto.get(p.id) ?? [])];
    const filas = ids.length
      ? await this.prisma.costoMovimiento.findMany({
          where: { companyId: tenantId, activityId: { in: ids } },
          select: { rubro: true, importe: true, cantidad: true, userId: true, nota: true, fecha: true },
        })
      : [];

    const real: TotalesRubro = sumarPorRubro(filas);
    const cotizado = p.cotizacion ? cotizadoPorRubro(partidasDe(p.cotizacion.items)) : null;
    const porRubroCotizado = cotizado?.porRubro ?? rubrosEnCero();
    const directoCotizado = cotizado ? sumaDe(porRubroCotizado) : null;
    const directoReal = sumaDe(real);

    const parametros = await this.tarifas.parametros(tenantId, Number(workDateKey(new Date()).slice(0, 4)));
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
      rubros: RUBROS.map((r) => ({
        rubro: r,
        etiqueta: ETIQUETA_RUBRO[r],
        cotizado: cotizado ? porRubroCotizado[r] : null,
        real: real[r],
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
      acceso: { detalle: veTodo },
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
