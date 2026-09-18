import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { isClosedStatus } from './activity-status.js';
import { horasPlanValidas } from './actividad-tiempos.js';
import { camposDePeriodo, diasEntre, periodoDeActividad, sumarDias } from './actividad-periodo.js';
import { workDateKey } from '../common/time/workday.js';
import {
  canCancelActivity,
  canReassignFrom,
  chainExecutorIds,
  chainPeopleIds,
  cleanMotivo,
  loadActivityChain,
  MOTIVO_MINIMO,
  REASSIGN_FORBIDDEN,
  type ChainActor,
} from './activity-superiors.js';
import { esDeTodaLaEmpresa, puedeAsignarA, tiposVisibles, type Alcanzador } from '../me/equipo-alcance.js';

/**
 * Equipo de una actividad y su historial de reasignaciones.
 *
 * `Activity.responsableId` admite una sola persona, así que una instalación con
 * tres técnicos registraba a uno y los otros dos no figuraban en ninguna parte.
 * El responsable se conserva como **líder** —para no romper las consultas que
 * dependen de él— y el equipo se lleva aparte.
 *
 * Los viáticos siguen siendo **individuales**: cada asignado solicita los suyos
 * (`Viatico.usuarioId` + `actividadId`), no se prorratean. Al reasignar, quien
 * entra genera los suyos y los del anterior quedan a su nombre.
 */

export type AssigneeRole = 'LEAD' | 'TECNICO' | 'APOYO';

@Injectable()
export class ActivityTeamService {
  private readonly logger = new Logger(ActivityTeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  private async loadActivity(activityId: number, companyId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(companyId) },
      select: {
        id: true,
        companyId: true,
        responsableId: true,
        anNumber: true,
        titulo: true,
        assignmentCharge: true,
        coreKind: true,
      },
    });
    assertCompanyAccess(activity, companyId, 'Actividad');
    return activity!;
  }

  /**
   * Reprogramar día/hora: actualiza la agenda (inicio = entrega = máximo, como el formulario),
   * deja registro de → a con quién y por qué, y avisa al responsable, al equipo y a Christian.
   * El permiso lo valida quien llama (p. ej. MyActivitiesService: solo quien reparte).
   */
  async reschedule(
    activityId: number,
    nueva: Date,
    motivo: string | null,
    companyId: number | null | undefined,
    actorId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.loadActivity(activityId, tenantId);
    const actual = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: { fechaInicio: true, periodoInicio: true, periodoFin: true },
    });

    // Con periodo, reprogramar es recorrerlo entero: empieza el día nuevo y dura lo mismo.
    // Si no, la fecha máxima caería en el primer día y la daría por tarde a la hora citada.
    const periodo = periodoDeActividad(actual);
    const agenda = periodo
      ? (() => {
          const inicio = workDateKey(nueva);
          const recorrido = { inicio, fin: sumarDias(inicio, diasEntre(periodo.inicio, periodo.fin)) };
          return camposDePeriodo(recorrido, nueva);
        })()
      : { fechaInicio: nueva, fechaEntregaEsperada: nueva, fechaMaxima: nueva };

    await this.prisma.$transaction([
      this.prisma.activity.update({
        where: { id: activityId },
        data: agenda,
      }),
      this.prisma.activityScheduleChange.create({
        data: {
          activityId,
          companyId: tenantId,
          cambiadoPorId: actorId,
          fechaAnterior: actual?.fechaInicio ?? null,
          fechaNueva: nueva,
          motivo,
        },
      }),
    ]);

    const team = await this.prisma.activityAssignee.findMany({
      where: { activityId, retiradoAt: null },
      select: { userId: true },
    });
    void this.notificationHierarchy.notifyActivityRescheduled({
      activityId,
      // El aviso nombra la actividad por su título, nunca por el folio.
      label: activity.titulo || '',
      actorId,
      de: actual?.fechaInicio ?? null,
      a: nueva,
      motivo,
      recipientIds: [activity.responsableId, ...team.map((t) => t.userId)].filter(
        (id): id is number => Boolean(id),
      ),
    });

    return { ok: true, fechaNueva: nueva.toISOString() };
  }

  /** Equipo actual (y quién ya salió, si se pide). */
  async listTeam(activityId: number, companyId?: number | null, includeRemoved = false) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    return this.prisma.activityAssignee.findMany({
      where: {
        activityId,
        ...companyWhere(tenantId),
        ...(includeRemoved ? {} : { retiradoAt: null }),
      },
      include: { user: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ rol: 'asc' }, { asignadoAt: 'asc' }],
    });
  }

  /**
   * Añade una persona al equipo.
   *
   * Reincorporar a alguien que había salido reactiva su fila en vez de crear
   * una nueva: así el historial de horas de esa persona no se fragmenta.
   */
  /**
   * Asignar desde la pizarra o el detalle: solo a gente que alcanzas (tu organigrama o tu flujo de
   * despacho) y en actividades de los tipos que coordinas. Dirección asigna a cualquiera.
   * El reparto de despacho (`me/activities/:id/despacho`) ya valida su propio equipo.
   */
  async assertPuedeAsignar(actor: Alcanzador, activityId: number, userId: number, companyId?: number | null) {
    if (esDeTodaLaEmpresa(actor)) return;
    const tipos = tiposVisibles(actor);
    if (tipos) {
      const tenantId = requireCompanyId(companyId);
      const activity = await this.loadActivity(activityId, tenantId);
      if (!tipos.includes(String(activity.coreKind ?? ''))) {
        throw new ForbiddenException('Solo coordinas actividades de tipo servicio');
      }
    }
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, managerId: true },
    });
    if (!puedeAsignarA(actor, users, userId)) {
      throw new ForbiddenException('Solo puedes asignar a gente de tu equipo');
    }
  }

  async addMember(
    activityId: number,
    input: {
      userId: number;
      rol?: AssigneeRole;
      horasPlan?: number | null;
      indicaciones?: string | null;
    },
    companyId?: number | null,
    /** Quien suma a la persona: queda en el registro de despacho. */
    actorId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.loadActivity(activityId, tenantId);

    if (!Number.isInteger(input.userId) || input.userId <= 0) {
      throw new BadRequestException('Usuario inválido');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, isActive: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('El usuario no existe o está inactivo');

    const existing = await this.prisma.activityAssignee.findFirst({
      where: { activityId, userId: input.userId, ...companyWhere(tenantId) },
    });

    const notes =
      input.indicaciones != null ? String(input.indicaciones).trim() || null : undefined;
    const byId = actorId && actorId > 0 ? actorId : null;
    // Tiempo estimado de esta persona (la web de asignar lo pide): horas con dos decimales.
    const horasPlan = horasPlanValidas(input.horasPlan);

    let member;
    if (existing) {
      member = await this.prisma.activityAssignee.update({
        where: { id: existing.id },
        data: {
          retiradoAt: null,
          rol: input.rol ?? existing.rol,
          horasPlan: horasPlan ?? existing.horasPlan,
          ...(notes !== undefined ? { indicaciones: notes } : {}),
          // Registro de despacho: volver al equipo cuenta como una entrega nueva.
          ...(existing.retiradoAt
            ? { asignadoAt: new Date(), asignadoPorId: byId ?? existing.asignadoPorId }
            : existing.asignadoPorId == null && byId
              ? { asignadoPorId: byId }
              : {}),
        },
        include: { user: { select: { id: true, nombre: true, email: true } } },
      });
    } else {
      member = await this.prisma.activityAssignee.create({
        data: {
          activityId,
          userId: input.userId,
          rol: input.rol ?? 'TECNICO',
          horasPlan,
          indicaciones: notes ?? null,
          companyId: tenantId,
          asignadoPorId: byId,
        },
        include: { user: { select: { id: true, nombre: true, email: true } } },
      });
    }

    // En despacho, el LEAD solo reparte: no sube evidencia ni bloquea el cierre.
    const reparte = activity.assignmentCharge === 'despacho' && member.rol === 'LEAD';
    if (!reparte) {
      await this.prisma.activityEvidence.upsert({
        where: { activityId_userId: { activityId, userId: input.userId } },
        create: {
          activityId,
          userId: input.userId,
          companyId: tenantId,
          status: 'ENTRY_PHOTO',
        },
        update: {},
      });
    }

    void this.notificationHierarchy?.notifyActivityDispatched({
      activityId,
      label: activity.titulo || '',
      actorId: byId,
      memberId: member.userId,
      memberName: member.user?.nombre ?? 'alguien del equipo',
      responsableId: activity.responsableId,
      reparte,
    });

    return member;
  }

  /**
   * Saca a alguien del equipo.
   *
   * No se borra la fila: se marca la salida. Las horas que ya dedicó y los
   * viáticos que solicitó siguen siendo suyos y deben poder consultarse.
   */
  async removeMember(activityId: number, userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const result = await this.prisma.activityAssignee.updateMany({
      where: { activityId, userId, retiradoAt: null, ...companyWhere(tenantId) },
      data: { retiradoAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Esa persona no está en el equipo de la actividad');
    }
    return { removed: true };
  }

  /** Horas reales dedicadas por una persona, para el costo real del servicio. */
  async setActualHours(
    activityId: number,
    userId: number,
    horasReales: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    if (!Number.isFinite(horasReales) || horasReales < 0) {
      throw new BadRequestException('Las horas deben ser un número no negativo');
    }

    const result = await this.prisma.activityAssignee.updateMany({
      where: { activityId, userId, ...companyWhere(tenantId) },
      data: { horasReales },
    });
    if (result.count === 0) {
      throw new NotFoundException('Esa persona no está asignada a la actividad');
    }
    return { updated: true };
  }

  /**
   * Qué puede hacer quien consulta como superior en esta actividad: cancelarla y a quién puede
   * reemplazar («Pasar a otro compañero»). Web y apps solo muestran los botones que aplican.
   */
  async superiorActions(activityId: number, actor: ChainActor, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const chain = await loadActivityChain(this.prisma, activityId, tenantId);
    const cerrada = isClosedStatus(chain.estatus);
    const ejecutores = new Set(chainExecutorIds(chain));
    const personas = cerrada
      ? []
      : chainPeopleIds(chain)
          .filter((id) => canReassignFrom(actor, chain, id))
          .map((id) => ({
            userId: id,
            nombre: chain.nombres.get(id) || 'Sin nombre',
            rol: chain.members.find((m) => m.userId === id)?.rol ?? (id === chain.responsableId ? 'LEAD' : 'TECNICO'),
            responsable: id === chain.responsableId,
            ejecuta: ejecutores.has(id),
          }));
    return {
      estatus: chain.estatus,
      cerrada,
      puedeCancelar: !cerrada && canCancelActivity(actor, chain),
      puedePasar: personas.length > 0,
      personas,
      motivoMinimo: MOTIVO_MINIMO,
    };
  }

  /**
   * «Pasar a otro compañero»: quien la tenía (`deUsuarioId`, por omisión el responsable) deja su
   * lugar a `aUsuarioId`, que continúa donde se quedó.
   *
   * - Solo superiores de la persona reemplazada (misma regla que cancelar) y con motivo (mín. 10).
   * - Queda constancia en `ActivityReassignment` (de, a, quién la movió y por qué).
   * - Quien entra hereda el lugar en la cadena (rol, indicaciones y orden) y recibe **su propia**
   *   evidencia desde la foto de entrada: toma su entrada y su salida.
   * - Quien sale queda retirado (`retiradoAt`) con su avance parcial intacto: revisores y quien
   *   continúa lo ven como «Avance anterior de <nombre>». `retirarAnterior: false` lo conserva
   *   como apoyo (uso del centro de despacho).
   */
  async reassign(
    activityId: number,
    input: { aUsuarioId: number; deUsuarioId?: number | null; motivo?: string; retirarAnterior?: boolean },
    actor: ChainActor,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const chain = await loadActivityChain(this.prisma, activityId, tenantId);
    if (isClosedStatus(chain.estatus)) {
      throw new BadRequestException('La actividad ya está cerrada (finalizada o cancelada); no se puede pasar a otro compañero');
    }

    const aUsuarioId = Number(input?.aUsuarioId);
    if (!Number.isInteger(aUsuarioId) || aUsuarioId <= 0) {
      throw new BadRequestException('Elige al compañero que la va a continuar');
    }
    const anterior = input?.deUsuarioId != null ? Number(input.deUsuarioId) : chain.responsableId;
    if (!chainPeopleIds(chain).includes(anterior)) {
      throw new NotFoundException('Esa persona ya no está en el equipo de la actividad');
    }
    if (!canReassignFrom(actor, chain, anterior)) {
      throw new ForbiddenException(REASSIGN_FORBIDDEN);
    }
    const motivo = cleanMotivo(input?.motivo);
    if (!motivo) {
      throw new BadRequestException(`Escribe por qué la pasas a otro compañero (mínimo ${MOTIVO_MINIMO} caracteres)`);
    }
    if (anterior === aUsuarioId) {
      throw new BadRequestException('Elige a un compañero distinto de quien la tiene');
    }
    if (chainPeopleIds(chain).includes(aUsuarioId)) {
      throw new BadRequestException('Esa persona ya está en el equipo de la actividad');
    }

    const destino = await this.prisma.user.findFirst({
      where: { id: aUsuarioId, isActive: true },
      select: { id: true },
    });
    if (!destino) throw new NotFoundException('El compañero elegido no existe o está inactivo');

    const retirar = input?.retirarAnterior !== false;
    const esResponsable = anterior === chain.responsableId;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const deRow = await tx.activityAssignee.findFirst({ where: { activityId, userId: anterior } });
      const rolNuevo = esResponsable ? 'LEAD' : (deRow?.rol ?? 'TECNICO');

      if (esResponsable) {
        await tx.activity.update({
          where: { id: activityId },
          data: { responsableId: aUsuarioId, fechaAsignacion: now },
        });
      }

      await tx.activityReassignment.create({
        data: {
          activityId,
          deUsuarioId: anterior,
          aUsuarioId,
          movidaPorId: actor.id,
          motivo,
          companyId: tenantId,
        },
      });

      // Quien entra ocupa el mismo lugar de la cadena: rol, indicaciones y orden de llegada.
      const lugar = {
        rol: rolNuevo,
        retiradoAt: null,
        asignadoPorId: actor.id,
        ...(deRow?.asignadoAt ? { asignadoAt: deRow.asignadoAt } : {}),
        ...(deRow?.indicaciones ? { indicaciones: deRow.indicaciones } : {}),
      };
      const yaEnEquipo = await tx.activityAssignee.findFirst({ where: { activityId, userId: aUsuarioId } });
      if (yaEnEquipo) {
        await tx.activityAssignee.update({ where: { id: yaEnEquipo.id }, data: lugar });
      } else {
        await tx.activityAssignee.create({
          data: { activityId, userId: aUsuarioId, companyId: tenantId, ...lugar },
        });
      }

      if (retirar) {
        if (deRow) {
          await tx.activityAssignee.updateMany({
            where: { activityId, userId: anterior, retiradoAt: null },
            data: { retiradoAt: now },
          });
        } else {
          // Responsable sin fila de equipo: se deja la fila retirada para que su avance siga visible.
          await tx.activityAssignee.create({
            data: { activityId, userId: anterior, rol: 'LEAD', companyId: tenantId, retiradoAt: now },
          });
        }
      } else if (deRow) {
        await tx.activityAssignee.update({ where: { id: deRow.id }, data: { rol: 'APOYO' } });
      } else {
        await tx.activityAssignee.create({
          data: { activityId, userId: anterior, rol: 'APOYO', companyId: tenantId },
        });
      }

      // Su propia evidencia, desde la foto de entrada (en despacho el LEAD solo reparte).
      const reparte = chain.assignmentCharge === 'despacho' && rolNuevo === 'LEAD';
      if (!reparte) {
        await tx.activityEvidence.upsert({
          where: { activityId_userId: { activityId, userId: aUsuarioId } },
          create: { activityId, userId: aUsuarioId, companyId: tenantId, status: 'ENTRY_PHOTO' },
          update: {},
        });
      }

      return { reassigned: true, de: anterior, a: aUsuarioId, retiradoAnterior: retirar, motivo };
    });

    // Opcional: las pruebas del equipo arman el servicio sin avisos.
    void Promise.resolve(
      this.notificationHierarchy?.notifyActivityReassigned({
        activityId,
        actorId: actor.id,
        deUsuarioId: anterior,
        aUsuarioId,
        motivo,
        retiradoAnterior: retirar,
      }),
    ).catch(() => undefined);
    return result;
  }

  /** Historial de reasignaciones, para responder "¿quién la ha tenido?". */
  async listReassignments(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    return this.prisma.activityReassignment.findMany({
      where: { activityId, ...companyWhere(tenantId) },
      include: {
        deUsuario: { select: { id: true, nombre: true } },
        aUsuario: { select: { id: true, nombre: true } },
        movidaPor: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Material consumido por la actividad.
   *
   * Es el "control de materiales" de Operaciones y el "Material utilizado" que
   * Ingeniería reporta: antes `StockMovement` no apuntaba a la actividad y la
   * pregunta no tenía respuesta.
   */
  async listMaterials(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const movimientos = await this.prisma.stockMovement.findMany({
      where: { activityId, ...companyWhere(tenantId) },
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const costoTotal = movimientos.reduce((sum, m) => sum + Number(m.totalCost ?? 0), 0);
    return { movimientos, costoTotal };
  }

  /** Timeline unificada: reasignaciones, incidencias, material y eventos de evidencia. */
  async buildTimeline(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      select: {
        assignmentCharge: true,
        estatus: true,
        fechaAsignacion: true,
        fechaInicio: true,
        fechaFinalizacion: true,
        acsEnteredAt: true,
        acsExitedAt: true,
        acsLeftSite: true,
        acsEntryDoor: true,
        acsEnteredByUser: { select: { nombre: true } },
        cancelReason: true,
        cancelledAt: true,
        cancelledBy: { select: { nombre: true } },
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    const [reassignments, incidents, recommendations, movements, evidence, team, cambiosAgenda] = await Promise.all([
      this.prisma.activityReassignment.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        include: {
          deUsuario: { select: { id: true, nombre: true } },
          aUsuario: { select: { id: true, nombre: true } },
          movidaPor: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.activityIncident.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          descripcion: true,
          severidad: true,
          createdAt: true,
          resueltoAt: true,
        },
      }),
      this.prisma.activityRecommendation.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          descripcion: true,
          estado: true,
          createdAt: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.activityEvidence.findFirst({
        where: { activityId },
        select: {
          reviewStatus: true,
          reviewedAt: true,
          serviceSheetCompletedAt: true,
          serviceSheetUploadedAt: true,
          entryPhotoUploadedAt: true,
          exitPhotoUploadedAt: true,
          reviewedBy: { select: { nombre: true } },
        },
      }),
      // Registro de despacho: quién sumó a quién y cuándo.
      this.prisma.activityAssignee.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        select: {
          id: true,
          rol: true,
          indicaciones: true,
          asignadoAt: true,
          retiradoAt: true,
          user: { select: { nombre: true } },
          asignadoPor: { select: { nombre: true } },
        },
        orderBy: { asignadoAt: 'asc' },
      }),
      // Reprogramaciones de día/hora (de → a, quién, por qué).
      this.prisma.activityScheduleChange.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        select: {
          id: true,
          createdAt: true,
          fechaAnterior: true,
          fechaNueva: true,
          motivo: true,
          cambiadoPor: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Revisiones de evidencia (aprobada / devuelta) y cuándo terminó cada quien su evidencia.
    const [revisiones, terminadas] = await Promise.all([
      this.prisma.activityEvidenceReview.findMany({
        where: { activityId, ...companyWhere(tenantId) },
        select: {
          id: true,
          decision: true,
          score: true,
          notes: true,
          createdAt: true,
          reviewer: { select: { nombre: true } },
          evidenceUser: { select: { nombre: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.activityEvidence.findMany({
        where: { activityId, completedAt: { not: null } },
        select: { completedAt: true },
      }),
    ]);

    const fmtAgenda = (d: Date | null | undefined) =>
      d
        ? new Date(d).toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
    /** Día/hora que tenía programada la actividad en el instante `t`. */
    const programadaEn = (t: Date): Date | null => {
      let valor: Date | null = cambiosAgenda.length
        ? cambiosAgenda[0].fechaAnterior
        : activity.fechaInicio ?? null;
      for (const c of cambiosAgenda) {
        if (c.createdAt.getTime() <= t.getTime()) valor = c.fechaNueva;
      }
      return valor;
    };

    type TimelineEvent = {
      id: string;
      at: string;
      kind: string;
      title: string;
      subtitle?: string;
      icon: string;
    };

    const events: TimelineEvent[] = [];

    if (activity.fechaAsignacion) {
      events.push({
        id: 'assigned',
        at: new Date(activity.fechaAsignacion).toISOString(),
        kind: 'estado',
        title: 'Actividad asignada',
        icon: '📋',
      });
    }
    if (activity.fechaInicio) {
      // fechaInicio se llena al programar (día/hora del formulario): solo es «inicio» si ya arrancó.
      const arranco = /proceso|validar|finaliz|complet|aprob|rechaz/i.test(activity.estatus || '');
      events.push({
        id: 'started',
        at: new Date(activity.fechaInicio).toISOString(),
        kind: arranco ? 'estado' : 'agenda',
        title: arranco ? 'Inicio en campo' : 'Programada',
        icon: arranco ? '🚀' : '📅',
      });
    }
    if (activity.acsEnteredAt) {
      const who = activity.acsEnteredByUser?.nombre;
      const door = activity.acsEntryDoor;
      events.push({
        id: 'acs-entry',
        at: new Date(activity.acsEnteredAt).toISOString(),
        kind: 'acs',
        title: who ? `${who} entró por ACS` : 'Entró por ACS',
        subtitle: door || undefined,
        icon: '🚪',
      });
    }
    if (activity.acsExitedAt || activity.acsLeftSite) {
      events.push({
        id: 'acs-exit',
        at: new Date(activity.acsExitedAt ?? activity.acsEnteredAt ?? Date.now()).toISOString(),
        kind: 'acs',
        title: 'Salió del sitio (ACS)',
        icon: '🚶',
      });
    }

    // Cancelación documentada: quién, cuándo y por qué.
    if (activity.cancelledAt) {
      events.push({
        id: 'cancelled',
        at: new Date(activity.cancelledAt).toISOString(),
        kind: 'cancelada',
        title: `Cancelada por ${activity.cancelledBy?.nombre ?? 'un superior'}`,
        subtitle: activity.cancelReason ? `Motivo: ${activity.cancelReason}` : undefined,
        icon: '🚫',
      });
    }

    for (const r of reassignments) {
      const a = r.aUsuario?.nombre ?? 'otro compañero';
      events.push({
        id: `reassign-${r.id}`,
        at: new Date(r.createdAt).toISOString(),
        kind: 'reasignación',
        title: r.deUsuario
          ? `${r.movidaPor?.nombre ?? 'Un superior'} la pasó de ${r.deUsuario.nombre} a ${a}`
          : `Reasignada a ${a}`,
        subtitle: r.motivo ? `Motivo: ${r.motivo}` : undefined,
        icon: '👤',
      });
    }

    const despacho = activity.assignmentCharge === 'despacho';
    for (const m of team) {
      const quien = m.user?.nombre ?? 'Alguien';
      const por = m.asignadoPor?.nombre;
      const reparte = despacho && m.rol === 'LEAD';
      const papel = reparte ? 'La reparte' : m.rol === 'LEAD' ? 'Responsable' : m.rol === 'TECNICO' ? 'La ejecuta' : 'Apoyo';
      const prog = programadaEn(new Date(m.asignadoAt));
      events.push({
        id: `team-${m.id}`,
        at: new Date(m.asignadoAt).toISOString(),
        // Tipo 1 del registro: cuándo se envió (la hora del evento) y para cuándo iba.
        kind: 'enviada',
        title:
          por && por !== quien
            ? `${por} ${reparte ? 'la pasó a' : 'la asignó a'} ${quien}`
            : `${quien} quedó a cargo`,
        subtitle: [papel, prog ? `Programada: ${fmtAgenda(prog)}` : null, m.indicaciones]
          .filter(Boolean)
          .join(' · '),
        icon: reparte ? '📨' : '👷',
      });
      if (m.retiradoAt) {
        events.push({
          id: `team-out-${m.id}`,
          at: new Date(m.retiradoAt).toISOString(),
          kind: 'despacho',
          title: `${quien} salió del equipo`,
          icon: '↩️',
        });
      }
    }

    // Tipo 2 del registro: reprogramaciones (cuándo se movió, quién, de → a).
    for (const c of cambiosAgenda) {
      events.push({
        id: `agenda-${c.id}`,
        at: new Date(c.createdAt).toISOString(),
        kind: 'reprogramada',
        title: `${c.cambiadoPor?.nombre ?? 'Alguien'} la reprogramó`,
        subtitle: [
          `De ${fmtAgenda(c.fechaAnterior) ?? 'sin fecha'} a ${fmtAgenda(c.fechaNueva)}`,
          c.motivo,
        ]
          .filter(Boolean)
          .join(' · '),
        icon: '🕑',
      });
    }

    for (const inc of incidents) {
      events.push({
        id: `inc-${inc.id}`,
        at: new Date(inc.createdAt).toISOString(),
        kind: 'incidencia',
        title: String(inc.descripcion).slice(0, 120),
        subtitle: String(inc.severidad ?? ''),
        icon: '⚠️',
      });
      if (inc.resueltoAt) {
        events.push({
          id: `inc-res-${inc.id}`,
          at: new Date(inc.resueltoAt).toISOString(),
          kind: 'incidencia',
          title: `Incidencia resuelta`,
          subtitle: String(inc.descripcion).slice(0, 80),
          icon: '✅',
        });
      }
    }

    for (const rec of recommendations) {
      events.push({
        id: `rec-${rec.id}`,
        at: new Date(rec.createdAt).toISOString(),
        kind: 'recomendación',
        title: String(rec.descripcion).slice(0, 120),
        subtitle: String(rec.estado ?? ''),
        icon: '💡',
      });
    }

    for (const m of movements) {
      events.push({
        id: `mat-${m.id}`,
        at: new Date(m.createdAt).toISOString(),
        kind: 'material',
        title: `${m.product?.name ?? 'Material'} (${m.quantity})`,
        subtitle: String(m.type),
        icon: '📦',
      });
    }

    if (evidence?.entryPhotoUploadedAt) {
      events.push({
        id: 'ev-entry',
        at: new Date(evidence.entryPhotoUploadedAt).toISOString(),
        kind: 'evidencia',
        title: 'Check-in / llegada registrada',
        icon: '📍',
      });
    }
    if (evidence?.exitPhotoUploadedAt) {
      events.push({
        id: 'ev-exit',
        at: new Date(evidence.exitPhotoUploadedAt).toISOString(),
        kind: 'evidencia',
        title: 'Check-out / salida registrada',
        icon: '📍',
      });
    }
    if (evidence?.serviceSheetCompletedAt) {
      events.push({
        id: 'ev-sheet',
        at: new Date(evidence.serviceSheetCompletedAt).toISOString(),
        kind: 'evidencia',
        title: 'Hoja de servicio completada',
        icon: '📝',
      });
    }
    if (evidence?.reviewedAt && revisiones.length === 0) {
      events.push({
        id: 'ev-review',
        at: new Date(evidence.reviewedAt).toISOString(),
        kind: 'evidencia',
        title: `Evidencia ${String(evidence.reviewStatus ?? 'revisada').toLowerCase()}`,
        subtitle: evidence.reviewedBy?.nombre,
        icon: '📸',
      });
    }

    // Tipo 3 del registro: cuándo se cumplió (terminó el trabajo), contra lo programado.
    // La aprobación llega después; la hora de cumplimiento es la de la última evidencia enviada.
    const ultimaEvidencia = terminadas.reduce<Date | null>(
      (max, e) => (e.completedAt && (!max || e.completedAt > max) ? e.completedAt : max),
      null,
    );
    const cumplidaAt = /validar|finaliz/i.test(activity.estatus)
      ? (ultimaEvidencia ?? activity.fechaFinalizacion)
      : activity.fechaFinalizacion;
    if (cumplidaAt) {
      const fin = new Date(cumplidaAt);
      const prog = programadaEn(fin);
      const retrasoMin = prog ? Math.round((fin.getTime() - new Date(prog).getTime()) / 60_000) : null;
      const puntualidad =
        retrasoMin == null
          ? null
          : retrasoMin > 15
            ? `${retrasoMin >= 60 ? `${Math.round(retrasoMin / 60)} h` : `${retrasoMin} min`} tarde`
            : 'a tiempo';
      events.push({
        id: 'completed',
        at: fin.toISOString(),
        kind: 'cumplida',
        title: 'Cumplida',
        subtitle: prog ? `Programada: ${fmtAgenda(prog)} · ${puntualidad}` : undefined,
        icon: '✅',
      });
    }

    for (const r of revisiones) {
      const quien = r.reviewer?.nombre ?? 'Un superior';
      const estrellas = r.score ? `${'★'.repeat(r.score)}${'☆'.repeat(Math.max(0, 5 - r.score))}` : null;
      events.push({
        id: `review-${r.id}`,
        at: r.createdAt.toISOString(),
        kind: 'revision',
        title:
          r.decision === 'APROBADA'
            ? `Aprobada por ${quien}`
            : r.decision === 'DEVUELTA_TODO'
              ? `Devuelta completa por ${quien}`
              : `Devuelta para corregir por ${quien}`,
        subtitle: [r.evidenceUser?.nombre, estrellas, r.notes].filter(Boolean).join(' · '),
        icon: r.decision === 'APROBADA' ? '✅' : '↩️',
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { events };
  }
}
