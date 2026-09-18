/**
 * «Programar actividades del proyecto».
 *
 * Regla del dueño (18-09): el tiempo de ejecución del proyecto define los periodos de
 * sus actividades, para no cargarlas cada día cuando el trabajo dura semanas. Aquí se
 * propone una actividad por etapa del cronograma (o por etapa × sitio), cada una con su
 * periodo encadenado —la siguiente empieza cuando termina la anterior—, y al confirmar
 * se crean todas de una vez.
 *
 * Se crean con `ActivitiesService.create` (folio AN-xxxx, aviso de asignación, fila LEAD
 * y evidencia) y el apoyo con `ActivityTeamService.addMember` (su aviso de despacho):
 * es el mismo camino que la pizarra, no uno paralelo.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityTeamService } from '../activities/activity-team.service.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { esCerrada } from '../activities/actividad-tiempos.js';
import {
  claveDia,
  encadenarEtapas,
  periodoDto,
  validarPeriodo,
  type Periodo,
  type PeriodoDto,
} from '../activities/actividad-periodo.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ProyectosProfesionalService } from './proyectos-profesional.service.js';
import type { ProgramarActividadesDto } from './dto/programar-actividades.dto.js';

/** Tope de actividades por llamada (etapas × sitios): más que esto es un error de captura. */
export const MAX_ACTIVIDADES_POR_PROGRAMACION = 200;

export type ActividadProgramada = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  sitio: string | null;
  responsableId: number;
  periodo: PeriodoDto | null;
};

export type EtapaPropuesta = {
  hitoId: number;
  nombre: string;
  descripcion: string | null;
  estado: string;
  responsableId: number | null;
  inicio: string;
  fin: string;
  dias: number;
  /** La fecha planeada quedaba antes de que terminara la etapa anterior: se recorrió. */
  ajustada: boolean;
  /** Actividades que ya ejecutan esta etapa (no se vuelven a crear). */
  programadas: ActividadProgramada[];
  /** ¿Conviene incluirla? No si ya se cumplió, se canceló o ya tiene actividades. */
  sugerida: boolean;
};

export type PropuestaProgramacion = {
  proyecto: {
    id: number;
    title: string;
    status: string;
    inicio: string | null;
    fin: string | null;
    siteCount: number | null;
    responsableId: number | null;
  };
  etapas: EtapaPropuesta[];
};

type Actor = { id: number; isSuperAdmin?: boolean };

const ETAPA_TERMINADA = new Set(['CUMPLIDO', 'CANCELADO']);

@Injectable()
export class ProyectoProgramacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly team: ActivityTeamService,
    private readonly proyectos: ProyectosProfesionalService,
  ) {}

  private async cargar(projectId: number, tenantId: number) {
    const proyecto = await this.prisma.operationalProject.findFirst({
      where: { id: projectId, ...(companyWhere(tenantId) as Prisma.OperationalProjectWhereInput) },
      select: {
        id: true,
        title: true,
        description: true,
        scopeSummary: true,
        status: true,
        startDate: true,
        endDate: true,
        siteCount: true,
        responsableId: true,
        clientId: true,
        companyId: true,
        // El mismo orden que el cronograma del detalle.
        milestones: {
          orderBy: [{ orden: 'asc' }, { plannedDate: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            plannedDate: true,
            status: true,
            responsableId: true,
          },
        },
        activities: {
          where: { deletedAt: null, projectMilestoneId: { not: null } },
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
            branchNumber: true,
            responsableId: true,
            projectMilestoneId: true,
            periodoInicio: true,
            periodoFin: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    assertCompanyAccess(proyecto as any, tenantId, 'Proyecto');
    return proyecto as NonNullable<typeof proyecto>;
  }

  private programadasPorEtapa(
    actividades: Awaited<ReturnType<ProyectoProgramacionService['cargar']>>['activities'],
    ahora: Date,
  ): Map<number, ActividadProgramada[]> {
    const porEtapa = new Map<number, ActividadProgramada[]>();
    for (const a of actividades) {
      // Una cancelada no cuenta: esa etapa se puede volver a programar.
      if (!a.projectMilestoneId || /cancel/i.test(a.estatus || '')) continue;
      const lista = porEtapa.get(a.projectMilestoneId) ?? [];
      lista.push({
        id: a.id,
        anNumber: a.anNumber,
        titulo: a.titulo,
        estatus: a.estatus,
        sitio: a.branchNumber ?? null,
        responsableId: a.responsableId,
        periodo: periodoDto(a, ahora, esCerrada(a.estatus)),
      });
      porEtapa.set(a.projectMilestoneId, lista);
    }
    return porEtapa;
  }

  /** La propuesta: etapas con su periodo encadenado y lo que ya está programado. */
  async propuesta(projectId: number, companyId?: number | null): Promise<PropuestaProgramacion> {
    const tenantId = requireCompanyId(companyId);
    const p = await this.cargar(projectId, tenantId);
    const cadena = encadenarEtapas(p.milestones, p.startDate, p.endDate);
    const programadas = this.programadasPorEtapa(p.activities, new Date());

    return {
      proyecto: {
        id: p.id,
        title: p.title,
        status: p.status,
        inicio: claveDia(p.startDate),
        fin: claveDia(p.endDate),
        siteCount: p.siteCount ?? null,
        responsableId: p.responsableId ?? null,
      },
      etapas: p.milestones.map((h, i) => {
        const tramo = cadena[i];
        const yaTiene = programadas.get(h.id) ?? [];
        return {
          hitoId: h.id,
          nombre: h.name,
          descripcion: h.description ?? null,
          estado: h.status,
          responsableId: h.responsableId ?? p.responsableId ?? null,
          inicio: tramo?.inicio ?? claveDia(p.startDate) ?? '',
          fin: tramo?.fin ?? claveDia(p.startDate) ?? '',
          dias: tramo?.dias ?? 1,
          ajustada: tramo?.ajustada ?? false,
          programadas: yaTiene,
          sugerida: !ETAPA_TERMINADA.has(h.status) && yaTiene.length === 0,
        };
      }),
    };
  }

  /**
   * Crea las actividades de las etapas elegidas. Todo se valida antes de crear la
   * primera, para no dejar media programación si algo venía mal. Lo que ya existe para
   * la misma etapa (y sitio) se omite: pulsar dos veces no duplica.
   */
  async programar(
    projectId: number,
    dto: ProgramarActividadesDto,
    actor: Actor,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const p = await this.cargar(projectId, tenantId);

    if (p.status === 'CANCELLED' || p.status === 'COMPLETED') {
      throw new BadRequestException(
        p.status === 'CANCELLED'
          ? 'El proyecto está cancelado: reactívalo para programar actividades'
          : 'El proyecto ya se terminó: reábrelo para programar actividades',
      );
    }
    const etapas = dto?.etapas ?? [];
    if (!etapas.length) throw new BadRequestException('Elige al menos una etapa');

    const hitos = new Map(p.milestones.map((h) => [h.id, h]));
    const vistos = new Set<number>();
    const planes: Array<{
      hito: (typeof p.milestones)[number];
      periodo: Periodo;
      responsableId: number;
      apoyoIds: number[];
      titulo: string | null;
      indicaciones: string | null;
    }> = [];
    for (const e of etapas) {
      const hito = hitos.get(Number(e.hitoId));
      if (!hito) throw new NotFoundException('Una de las etapas no es de este proyecto');
      if (vistos.has(hito.id)) throw new BadRequestException(`La etapa «${hito.name}» viene dos veces`);
      vistos.add(hito.id);
      const leido = validarPeriodo(e.inicio, e.fin);
      if (leido.error || !leido.periodo) {
        throw new BadRequestException(`Etapa «${hito.name}»: ${leido.error ?? 'falta el periodo'}`);
      }
      const responsableId = Number(e.responsableId);
      if (!Number.isInteger(responsableId) || responsableId <= 0) {
        throw new BadRequestException(`Etapa «${hito.name}»: falta quién la lleva`);
      }
      const apoyoIds = [...new Set((e.apoyoIds ?? []).map(Number))].filter(
        (id) => Number.isInteger(id) && id > 0 && id !== responsableId,
      );
      planes.push({
        hito,
        periodo: leido.periodo,
        responsableId,
        apoyoIds,
        titulo: e.titulo?.trim() || null,
        indicaciones: e.indicaciones?.trim() || null,
      });
    }

    const personas = [...new Set(planes.flatMap((x) => [x.responsableId, ...x.apoyoIds]))];
    await this.proyectos.assertAlcanzaA(actor, personas);
    const activas = await this.prisma.user.findMany({
      where: { id: { in: personas }, isActive: true },
      select: { id: true },
    });
    if (activas.length !== personas.length) {
      throw new BadRequestException('Alguna de las personas elegidas ya no está activa');
    }

    const sitios: Array<number | null> =
      dto.porSitio && (p.siteCount ?? 0) > 0
        ? Array.from({ length: p.siteCount as number }, (_, i) => i + 1)
        : [null];
    if (planes.length * sitios.length > MAX_ACTIVIDADES_POR_PROGRAMACION) {
      throw new BadRequestException(
        `Serían ${planes.length * sitios.length} actividades; el tope por programación es ${MAX_ACTIVIDADES_POR_PROGRAMACION}`,
      );
    }

    const ahora = new Date();
    const yaProgramadas = this.programadasPorEtapa(p.activities, ahora);
    const creadas: Array<ActividadProgramada & { hitoId: number }> = [];
    const omitidas: Array<{ hitoId: number; sitio: string | null; motivo: string; activityId: number }> = [];

    for (const plan of planes) {
      for (const sitio of sitios) {
        const sitioTexto = sitio == null ? null : String(sitio);
        const existente = (yaProgramadas.get(plan.hito.id) ?? []).find(
          (a) => sitioTexto == null || a.sitio === sitioTexto,
        );
        if (existente) {
          omitidas.push({
            hitoId: plan.hito.id,
            sitio: sitioTexto,
            motivo: `Ya tiene la actividad ${existente.anNumber}`,
            activityId: existente.id,
          });
          continue;
        }

        const titulo = (
          plan.titulo ??
          `${p.title} — ${plan.hito.name}${sitio == null ? '' : ` · Sucursal ${sitio}`}`
        ).slice(0, 200);
        const creada = await this.activities.create(
          {
            titulo,
            descripcion: plan.hito.description || p.scopeSummary || p.description || undefined,
            indicaciones: plan.indicaciones ?? undefined,
            projectId: p.id,
            clientId: p.clientId,
            activityType: 'CLIENT',
            ticketType: 'INSTALACION',
            workType: 'ISSUE',
            coreKind: 'proyecto',
            assignmentCharge: 'ejecucion',
            prioridad: 'MEDIA',
            creadoPorId: actor.id,
            responsableId: plan.responsableId,
            periodoInicio: plan.periodo.inicio,
            periodoFin: plan.periodo.fin,
            projectMilestoneId: plan.hito.id,
            ...(sitio == null ? {} : { branchName: `Sucursal ${sitio}`, branchNumber: String(sitio) }),
          } as CreateActivityDto,
          p.companyId,
        );
        for (const userId of plan.apoyoIds) {
          await this.team.addMember(creada.id, { userId, rol: 'TECNICO' }, p.companyId, actor.id);
        }
        creadas.push({
          hitoId: plan.hito.id,
          id: creada.id,
          anNumber: creada.anNumber,
          titulo: creada.titulo,
          estatus: creada.estatus,
          sitio: sitioTexto,
          responsableId: creada.responsableId,
          periodo: periodoDto(creada, ahora),
        });
      }
    }

    return {
      creadas,
      omitidas,
      proyecto: await this.proyectos.detalle(projectId, tenantId),
    };
  }
}
