import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACTIVITY_STATUS, statusVariants } from '../activities/activity-status.js';
import { workDateColumn, workDateKey } from '../common/time/workday.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  armarEncargados,
  armarObra,
  esDeObra,
  filasDeArea,
  nombreCorto,
  puedeVerObra,
  raizDelOrganigrama,
  resumenDeGente,
  type FilaObra,
  type GenteKpi,
  type PersonaOrg,
} from './direccion.js';
import { esDeTodaLaEmpresa, subarbolIds } from './equipo-alcance.js';
import { sumaDias } from './kpis-equipo.js';
import { KpisEquipoService } from './kpis-equipo.service.js';
import { conRevisores, leerRevisores } from './revision-evidencias.js';

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };

const DIAS_DEL_RESUMEN = 30;
const DIAS_RESUELTO = 7;
const DIAS_COTIZACION_POR_VENCER = 7;
/** La semana del 14-09 es la demo sembrada: lo real cuenta desde la siguiente. */
const DESDE_OPERACION_REAL = new Date('2026-09-21T06:00:00Z');

/**
 * Dirección ve todo y cada encargado lo suyo (Velocidad Core, Ola 5). Solo lectura, salvo ligar actividades
 * de obra a un proyecto. Los KPIs salen de `KpisEquipoService`: los mismos que enseña Desempeño.
 */
@Injectable()
export class DireccionService {
  private readonly logger = new Logger('Direccion');

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisEquipoService,
  ) {}

  private rango30(now = new Date()) {
    const hasta = workDateKey(now);
    return { desde: sumaDias(hasta, -(DIAS_DEL_RESUMEN - 1)), hasta };
  }

  /** Lo que falle no tumba la pantalla: esa cifra sale como `null` y se dice «sin dato». */
  private async seguro<T>(respaldo: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`sin dato: ${(error as Error).message}`);
      return respaldo;
    }
  }

  private async organigrama(companyId: number): Promise<PersonaOrg[]> {
    const filas = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, puesto: true, managerId: true, roleKey: true },
    });
    return filas.map((u) => ({ ...u, id: Number(u.id), managerId: u.managerId == null ? null : Number(u.managerId) }));
  }

  /** Evidencia enviada que nadie ha revisado, por persona (la misma que cuenta «Tu día»). */
  private async pendientesPorPersona(companyId: number): Promise<Map<number, number>> {
    const filas = await this.prisma.activityEvidence.findMany({
      where: {
        ...companyWhere(companyId),
        status: 'COMPLETED',
        reviewStatus: { notIn: ['APPROVED', 'REJECTED'] },
        activity: { deletedAt: null, estatus: { in: statusVariants(ACTIVITY_STATUS.POR_VALIDAR) } },
      } as never,
      select: { userId: true },
      take: 1000,
    });
    const out = new Map<number, number>();
    for (const f of filas) out.set(f.userId, (out.get(f.userId) ?? 0) + 1);
    return out;
  }

  /** Mi área: la gente de quien mira. Dirección abre la de cualquier encargado con `encargado`. */
  async area(viewer: Viewer, companyIdRaw: number | null, encargadoId?: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const top = esDeTodaLaEmpresa(viewer);
    if (encargadoId && encargadoId !== viewer.id && !top) throw new ForbiddenException('Solo dirección abre el área de otra persona');
    const duenoId = encargadoId ?? viewer.id;
    const [orgReal, revisores, pendientes] = await Promise.all([
      this.organigrama(companyId),
      leerRevisores(this.prisma, companyId),
      this.pendientesPorPersona(companyId),
    ]);
    const dueno = orgReal.find((u) => u.id === duenoId);
    if (!dueno) throw new NotFoundException('Esa persona no está en la empresa');
    // Su gente por organigrama, sin lo que revisa otro; y a quienes revisa por encargo.
    const org = conRevisores(orgReal, revisores);
    const ids = subarbolIds(duenoId, org);
    ids.delete(duenoId);

    const rango = this.rango30();
    const k = ids.size ? await this.kpis.getEquipo(viewer, companyId, rango) : { personas: [] as GenteKpi[] };
    const gente = (k.personas as GenteKpi[]).filter((p) => ids.has(p.persona.id));
    const porRevisarDe = new Map([...pendientes].filter(([id]) => ids.has(id)));
    const porRevisar = [...porRevisarDe.values()].reduce((s, n) => s + n, 0);
    return {
      encargado: { id: dueno.id, nombre: dueno.nombre, puesto: dueno.puesto ?? null },
      desde: rango.desde,
      hasta: rango.hasta,
      resumen: resumenDeGente(gente, porRevisar),
      gente: filasDeArea(gente, porRevisarDe),
    };
  }

  /** La pantalla Hoy de dirección: de un vistazo, sin abrir nada. */
  async hoy(viewer: Viewer, companyIdRaw: number | null, now = new Date()) {
    if (!esDeTodaLaEmpresa(viewer)) throw new ForbiddenException('Solo dirección');
    const companyId = requireCompanyId(companyIdRaw);
    const tw = companyWhere(companyId);
    const hace7 = new Date(now.getTime() - DIAS_RESUELTO * 86_400_000);
    const [org, revisores, pendientes, k] = await Promise.all([
      this.organigrama(companyId),
      leerRevisores(this.prisma, companyId),
      this.pendientesPorPersona(companyId),
      this.kpis.getEquipo(viewer, companyId, this.rango30(now)),
    ]);
    const gente = k.personas as GenteKpi[];
    const empresa = resumenDeGente(gente);
    const ids = new Set(gente.map((g) => g.persona.id));
    const raizId = raizDelOrganigrama(org);
    const orgConRevisor = conRevisores(org, revisores);

    const ultima = await this.seguro(null as { workDate: Date | null } | null, () =>
      this.prisma.attendance.findFirst({
        where: { type: 'entrada', workDate: { lte: workDateColumn(now) }, userId: { in: [...ids] } },
        orderBy: { workDate: 'desc' },
        select: { workDate: true },
      }),
    );
    const checaron = ultima?.workDate
      ? await this.seguro(0, async () => {
          const filas = await this.prisma.attendance.findMany({
            where: { type: 'entrada', workDate: ultima.workDate, userId: { in: [...ids] } },
            select: { userId: true },
            distinct: ['userId'],
          });
          return filas.length;
        })
      : 0;

    const conJefe = [...pendientes].reduce((s, [id, n]) => {
      const jefe = orgConRevisor.find((u) => u.id === id)?.managerId;
      return jefe != null && jefe !== raizId ? s + n : s;
    }, 0);
    const revisiones = await this.seguro([] as Array<{ reviewerId: number | null }>, () =>
      this.prisma.activityEvidenceReview.findMany({ where: { ...tw, createdAt: { gte: hace7 } } as never, select: { reviewerId: true }, take: 5000 }),
    );
    const directivos = new Set(org.filter((u) => u.roleKey === 'ceo').map((u) => u.id));

    const contar = (fn: () => Promise<number>) => this.seguro<number | null>(null, fn);
    const hoyInicio = workDateColumn(now);
    const porVencerHasta = new Date(now.getTime() + DIAS_COTIZACION_POR_VENCER * 86_400_000);
    const [cotBorrador, cotEnviadas, cotPorVencer, cotTotal] = await Promise.all([
      contar(() => this.prisma.cotizacion.count({ where: { ...tw, deletedAt: null, status: 'DRAFT' } as never })),
      contar(() => this.prisma.cotizacion.count({ where: { ...tw, deletedAt: null, status: 'SENT' } as never })),
      contar(() =>
        this.prisma.cotizacion.count({ where: { ...tw, deletedAt: null, status: { in: ['DRAFT', 'SENT'] }, validUntil: { gte: hoyInicio, lt: porVencerHasta } } as never }),
      ),
      this.seguro<number | null>(null, async () => {
        const r = await this.prisma.cotizacion.aggregate({ where: { ...tw, deletedAt: null, status: { in: ['DRAFT', 'SENT'] } } as never, _sum: { total: true } });
        return Number(r._sum.total ?? 0);
      }),
    ]);
    const [porValidar, proyectos, clientes, disenos, costos, productos, herramientas, facturas, avisos, salidas] = await Promise.all([
      contar(() => this.prisma.activity.count({ where: { ...tw, deletedAt: null, estatus: { in: statusVariants(ACTIVITY_STATUS.POR_VALIDAR) } } as never })),
      contar(() => this.prisma.operationalProject.count({ where: { ...tw, deletedAt: null, status: 'ACTIVE' } as never })),
      contar(() => this.prisma.salesClient.count({ where: tw as never })),
      contar(() => this.prisma.cctvDiseno.count({ where: tw as never })),
      contar(() => this.prisma.costoMovimiento.count({ where: tw as never })),
      contar(() => this.prisma.product.count({ where: tw as never })),
      contar(() => this.prisma.toolInventoryItem.count({ where: tw as never })),
      contar(() => this.prisma.invoice.count({ where: { ...tw, deletedAt: null } as never })),
      contar(() => this.prisma.notification.count({ where: { userId: viewer.id, createdAt: { gte: hace7 } } })),
      contar(() => this.prisma.salidaDeshecha.count({ where: { ...tw, createdAt: { gte: hace7 } } as never })),
    ]);
    const pendientesTotal = [...pendientes.values()].reduce((s, n) => s + n, 0);
    const obra = await this.seguro(null as ReturnType<typeof armarObra> | null, () => this.calcularObra(companyId));
    const arquitecto = org.find((u) => u.roleKey === 'arquitecto');

    return {
      generadoAt: now.toISOString(),
      hoy: {
        checaron,
        de: ids.size,
        fecha: ultima?.workDate ? ultima.workDate.toISOString().slice(0, 10) : null,
        pctATiempo: empresa.pctATiempo,
        aTiempo: empresa.aTiempo,
        medidas: empresa.medidas,
        pctPuntual: empresa.pctPuntual,
        puntuales: empresa.puntuales,
        esperados: empresa.esperados,
        evidenciasSinRevisar: pendientesTotal,
        conSuJefe: conJefe,
        cotizacionesPorVencer: cotPorVencer,
      },
      resolvioSolo: {
        revisionesDeJefes: revisiones.filter((r) => r.reviewerId != null && !directivos.has(r.reviewerId)).length,
        revisiones: revisiones.length,
        avisos,
        salidasDeshechas: salidas,
      },
      porEncargado: raizId
        ? armarEncargados({ org, gente, revisores, pendientesDe: pendientes, raizId, viewerId: viewer.id })
        : [],
      obra:
        arquitecto && obra
          ? { id: arquitecto.id, nombre: nombreCorto(arquitecto.nombre), actividades: obra.actividades, ligadas: obra.ligadas }
          : null,
      modulos: {
        porValidar,
        cotizaciones: { borrador: cotBorrador, enviadas: cotEnviadas, monto: cotTotal },
        proyectos,
        clientes,
        disenos,
        costos,
        productos,
        herramientas,
        facturas,
      },
    };
  }

  private async calcularObra(companyId: number) {
    const filas = await this.prisma.$queryRaw<
      Array<{ id: number; titulo: string; coreKind: string | null; ticketTypeCustom: string | null; projectId: number | null; minutos: number; calculadoMin: number | null }>
    >(Prisma.sql`
      WITH ses AS (
        SELECT s."activityId", s."userId", SUM(EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) / 60.0)::float8 AS minutos,
               BOOL_OR(s."endReason" IN ('TOPE_12H', 'CORTE_DIA')) AS cortada
        FROM activity_work_sessions s
        WHERE s."companyId" = ${companyId} AND s."endedAt" IS NOT NULL AND s."startedAt" >= ${DESDE_OPERACION_REAL}
        GROUP BY 1, 2
      )
      SELECT a.id, a.titulo, a."coreKind", a."ticketTypeCustom", a."projectId",
             COALESCE(d.minutos::float8, ses.minutos) AS minutos,
             COALESCE(a."tiempoEstandarMin", a."tiempoEstimadoMin") AS "calculadoMin"
      FROM "Activity" a
      LEFT JOIN ses ON ses."activityId" = a.id AND ses."userId" = a."responsableId"
      LEFT JOIN actividad_tiempo_dicho d ON d."activityId" = a.id AND d."companyId" = a."companyId"
      WHERE a."companyId" = ${companyId} AND a."deletedAt" IS NULL AND a.estatus IN ('Finalizada', 'Por Validar')
        AND (d.minutos IS NOT NULL OR (NOT ses.cortada AND ses.minutos >= 5))`);
    const deObra: FilaObra[] = filas
      .filter((f) => esDeObra(f))
      .map((f) => ({ ...f, id: Number(f.id), projectId: f.projectId == null ? null : Number(f.projectId), minutos: Number(f.minutos), calculadoMin: f.calculadoMin == null ? null : Number(f.calculadoMin) }));
    return armarObra(deObra);
  }

  /** El retroanálisis de obra: lo que de verdad tomó cada trabajo contra lo que se calculó. */
  async obra(viewer: Viewer, companyIdRaw: number | null) {
    if (!puedeVerObra(viewer.roleKey, esDeTodaLaEmpresa(viewer))) throw new ForbiddenException('No tienes acceso a Obra');
    const companyId = requireCompanyId(companyIdRaw);
    const r = await this.calcularObra(companyId);
    const disenos = await this.seguro<number | null>(null, () => this.prisma.cctvDiseno.count({ where: companyWhere(companyId) as never }));
    return { ...r, disenos, desde: workDateKey(DESDE_OPERACION_REAL) };
  }

  /** Liga actividades de obra terminadas a un proyecto. Solo el proyecto, sin avisos ni cambios de estatus. */
  async ligarObra(viewer: Viewer, companyIdRaw: number | null, body: { actividadIds?: unknown; projectId?: unknown }) {
    if (!puedeVerObra(viewer.roleKey, esDeTodaLaEmpresa(viewer))) throw new ForbiddenException('No tienes acceso a Obra');
    const companyId = requireCompanyId(companyIdRaw);
    const projectId = Number(body?.projectId);
    const ids = Array.isArray(body?.actividadIds) ? [...new Set(body.actividadIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!Number.isInteger(projectId) || projectId <= 0 || !ids.length) throw new BadRequestException('Elige el proyecto y las actividades');
    if (ids.length > 200) throw new BadRequestException('Son demasiadas actividades de una vez');
    const proyecto = await this.prisma.operationalProject.findFirst({ where: { id: projectId, companyId, deletedAt: null }, select: { id: true } });
    if (!proyecto) throw new NotFoundException('Ese proyecto no existe');
    const filas = await this.prisma.activity.findMany({
      where: { id: { in: ids }, companyId, deletedAt: null, projectId: null },
      select: { id: true, coreKind: true, ticketTypeCustom: true, titulo: true },
    });
    const validas = filas.filter((f) => esDeObra(f)).map((f) => f.id);
    for (const id of validas) await this.prisma.activity.update({ where: { id }, data: { projectId } });
    return { ligadas: validas.length, omitidas: ids.length - validas.length };
  }
}
