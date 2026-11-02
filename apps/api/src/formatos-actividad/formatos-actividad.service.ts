import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityTeamService } from '../activities/activity-team.service.js';
import { mensajeAsignacionDenegada, puedeDejarActividadA, type ActorAsignacion } from '../activities/asignacion-departamento.js';
import type { CreateActivityDto } from '../activities/dto/create-activity.dto.js';
import { ActivityEvidenceFieldsService } from '../activities/evidence/activity-evidence-fields.service.js';
import { puedeGestionarActividades } from '../activities/puede-gestionar.js';
import { TiemposActividadService } from '../activities/tiempos-actividad.service.js';
import { ActivityToolsService } from '../activities/tools/activity-tools.service.js';
import { appUrls } from '../common/app-urls.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDayAtClock } from '../common/time/workday.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import {
  formatosIniciales,
  normalizarReceta,
  normalizarRenglon,
  planearRenglones,
  recetaDesdeActividad,
  TOPE_MIN_POR_ACTIVIDAD,
  type RenglonFormato,
} from './receta-formato.js';

export type ActorFormato = ActorAsignacion & { nombre?: string | null; permissions?: string[] | null };

export type AplicarFormato = {
  clave: string;
  responsableId: number;
  equipoIds?: number[];
  /** `AAAA-MM-DD` y `HH:MM`. Sin hora, la entrada de quien lo lleva. */
  fecha: string;
  hora?: string | null;
  clientId?: number | null;
  projectId?: number | null;
  sucursal?: string | null;
  /** Lo que se ve en pantalla, ya editado. */
  renglones: Array<Partial<RenglonFormato> & { titulo: string; minutos?: number }>;
};

const MENSAJE_SIN_PERMISO = 'Los formatos son de quien asigna actividades a otras personas';

@Injectable()
export class FormatosActividadService {
  private readonly logger = new Logger(FormatosActividadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
    private readonly team: ActivityTeamService,
    private readonly campos: ActivityEvidenceFieldsService,
    private readonly herramientas: ActivityToolsService,
    private readonly tiempos: TiemposActividadService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  private exigir(actor: ActorFormato) {
    if (!puedeGestionarActividades(actor as never)) throw new ForbiddenException(MENSAJE_SIN_PERMISO);
  }

  /** La primera vez que una empresa entra al catálogo le deja tres para empezar. No pisa nada. */
  private async sembrar(companyId: number, actorId: number) {
    const hay = await this.prisma.formatoActividad.count({ where: { companyId } });
    if (hay) return;
    for (const f of formatosIniciales()) {
      await this.prisma.formatoActividad.create({
        data: {
          companyId,
          nombre: f.nombre,
          descripcion: f.descripcion,
          receta: f.receta as unknown as Prisma.InputJsonValue,
          creadoPorId: actorId,
        },
      });
    }
  }

  async listar(actor: ActorFormato, companyId?: number | null) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    await this.sembrar(tenantId, actor.id);
    const filas = await this.prisma.formatoActividad.findMany({
      where: { companyId: tenantId, archivadoAt: null },
      orderBy: [{ usos: 'desc' }, { nombre: 'asc' }],
    });
    return filas.map((f) => ({ ...f, receta: normalizarReceta(f.receta) }));
  }

  private async cargar(id: number, companyId: number) {
    const f = await this.prisma.formatoActividad.findFirst({ where: { id, companyId, archivadoAt: null } });
    if (!f) throw new NotFoundException('Ese formato no existe o ya se archivó');
    return f;
  }

  async crear(dto: { nombre?: string; descripcion?: string | null; receta?: unknown }, actor: ActorFormato, companyId?: number | null) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    const nombre = (dto.nombre ?? '').trim().slice(0, 120);
    if (nombre.length < 2) throw new BadRequestException('Ponle nombre al formato');
    return this.prisma.formatoActividad.create({
      data: {
        companyId: tenantId,
        nombre,
        descripcion: dto.descripcion?.trim().slice(0, 300) || null,
        receta: normalizarReceta(dto.receta) as unknown as Prisma.InputJsonValue,
        creadoPorId: actor.id,
      },
    });
  }

  async editar(
    id: number,
    dto: { nombre?: string; descripcion?: string | null; receta?: unknown },
    actor: ActorFormato,
    companyId?: number | null,
  ) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    await this.cargar(id, tenantId);
    const nombre = dto.nombre?.trim().slice(0, 120);
    if (nombre !== undefined && nombre.length < 2) throw new BadRequestException('Ponle nombre al formato');
    return this.prisma.formatoActividad.update({
      where: { id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion?.trim().slice(0, 300) || null } : {}),
        ...(dto.receta !== undefined ? { receta: normalizarReceta(dto.receta) as unknown as Prisma.InputJsonValue } : {}),
        version: { increment: 1 },
      },
    });
  }

  async archivar(id: number, actor: ActorFormato, companyId?: number | null) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    await this.cargar(id, tenantId);
    await this.prisma.formatoActividad.update({ where: { id }, data: { archivadoAt: new Date() } });
    return { archivado: true };
  }

  /** Lo que ya se hizo, como borrador de receta. No guarda nada: lo guarda quien lo revisa. */
  async borradorDesdeActividad(activityId: number, actor: ActorFormato, companyId?: number | null) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    const a = await this.prisma.activity.findFirst({
      where: { id: activityId, companyId: tenantId, deletedAt: null },
      select: {
        titulo: true,
        coreKind: true,
        ticketTypeCustom: true,
        tiempoEstimadoMin: true,
        evidencePhotoRequired: true,
        indicaciones: true,
        evidenceFields: { select: { nombre: true, momentos: true } },
        toolRequirements: { select: { descripcion: true, cantidad: true } },
      },
    });
    if (!a) throw new NotFoundException('Esa actividad no existe');
    return { nombre: a.titulo.slice(0, 120), receta: recetaDesdeActividad(a as never) };
  }

  /** Todo lo que se puede revisar antes de crear la primera: no dejar medio paquete por un dato. */
  private async validarAplicacion(dto: AplicarFormato, actor: ActorFormato, companyId: number) {
    if (!dto.clave || dto.clave.length > 64) throw new BadRequestException('Falta la clave de la aplicación');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.fecha ?? '')) throw new BadRequestException('Elige el día');
    if (dto.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.hora)) throw new BadRequestException('La hora no es válida');

    const renglones = (dto.renglones ?? [])
      .map((r) => {
        const limpio = normalizarRenglon({ minutosBase: r.minutos, ...r, minutosPorUnidad: 0 });
        return limpio ? { ...limpio, minutos: Math.max(5, Math.round(Number(r.minutos ?? limpio.minutosBase))) } : null;
      })
      .filter((x): x is RenglonFormato & { minutos: number } => x != null);
    if (!renglones.length) throw new BadRequestException('Deja al menos una actividad');

    if (renglones.some((r) => r.coreKind === 'servicio') && !dto.clientId && !dto.projectId) {
      throw new BadRequestException('Elige el cliente: este formato lleva actividades de servicio');
    }
    if (dto.clientId) {
      const cliente = await this.prisma.serviceClient.findFirst({
        where: { id: dto.clientId, companyId },
        select: { id: true },
      });
      if (!cliente) throw new BadRequestException('Ese cliente no es de esta empresa');
    }
    let clientId = dto.clientId ?? null;
    if (dto.projectId) {
      const proyecto = await this.prisma.operationalProject.findFirst({
        where: { id: dto.projectId, companyId },
        select: { clientId: true },
      });
      if (!proyecto) throw new BadRequestException('Ese proyecto no es de esta empresa');
      clientId = proyecto.clientId;
    }

    const responsableId = Number(dto.responsableId);
    const equipo = [...new Set((dto.equipoIds ?? []).map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0 && id !== responsableId,
    );
    const personas = [responsableId, ...equipo];
    const roster = await this.users.listAssignmentRoster(companyId);
    for (const id of personas) {
      if (id === actor.id) continue;
      const persona = await this.users.findOne(id, companyId);
      if (!persona) throw new BadRequestException('Alguna de las personas elegidas no existe');
      const destino = {
        id: persona.id,
        email: persona.email ?? '',
        managerId: persona.managerId ?? null,
        departmentId: persona.departmentId ?? null,
        roleKey: persona.roleKey ?? null,
      };
      if (!puedeDejarActividadA(actor, destino, roster as never)) {
        throw new ForbiddenException(mensajeAsignacionDenegada(actor));
      }
    }
    const activas = await this.prisma.user.count({ where: { id: { in: personas }, isActive: true } });
    if (activas !== personas.length) throw new BadRequestException('Alguna de las personas elegidas ya no está activa');

    return { renglones, responsableId, equipo, personas, clientId };
  }

  /**
   * Crea el paquete. Dos toques no crean dos: la `clave` ya usada devuelve lo que se creó. No hay
   * transacción, porque cada alta avisa y publica eventos: si una falla, se dice cuáles sí quedaron.
   */
  async aplicar(id: number, dto: AplicarFormato, actor: ActorFormato, companyId?: number | null) {
    this.exigir(actor);
    const tenantId = requireCompanyId(companyId);
    const formato = await this.cargar(id, tenantId);

    const previa = await this.prisma.formatoAplicacion.findUnique({
      where: { companyId_clave: { companyId: tenantId, clave: dto.clave ?? '' } },
    });
    if (previa) return this.respuesta(previa.actividades, tenantId, []);

    const { renglones, responsableId, equipo, personas, clientId } = await this.validarAplicacion(dto, actor, tenantId);

    let aplicacion;
    try {
      aplicacion = await this.prisma.formatoAplicacion.create({
        data: { companyId: tenantId, formatoId: id, clave: dto.clave, version: formato.version, creadoPorId: actor.id },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      // Otra petición con la misma clave ganó el lugar: ella crea el paquete.
      const otra = await this.prisma.formatoAplicacion.findUnique({
        where: { companyId_clave: { companyId: tenantId, clave: dto.clave } },
      });
      return this.respuesta(otra?.actividades ?? [], tenantId, []);
    }

    const jornada = await this.tiempos.jornada(responsableId);
    const dia = new Date(`${dto.fecha}T12:00:00-06:00`);
    const [h, m] = (dto.hora || jornada.entrada).split(':').map(Number);
    const plan = planearRenglones(renglones.map((r) => r.minutos), workDayAtClock(dia, h, m), jornada);

    const creadas: number[] = [];
    const fallidas: Array<{ titulo: string; motivo: string }> = [];
    for (let i = 0; i < renglones.length; i++) {
      const r = renglones[i];
      const p = plan[i];
      try {
        const minutos = Math.min(r.minutos, TOPE_MIN_POR_ACTIVIDAD);
        const creada = await this.activities.create(
          {
            titulo: r.titulo,
            indicaciones: r.indicaciones ?? undefined,
            prioridad: 'MEDIA',
            estatus: 'Pendiente',
            // Los mismos valores que manda el formulario de alta para cada tipo (`buildActivityPayload`).
            activityType: dto.projectId ? 'CLIENT' : 'INTERNAL',
            ticketType: r.coreKind === 'servicio' ? 'CORRECTIVO' : 'OTRO',
            ticketTypeCustom:
              r.coreKind === 'comercial' ? 'COMERCIAL' : r.coreKind === 'tarea' ? (r.tipo ?? 'Otra tarea') : undefined,
            workType: 'ISSUE',
            coreKind: r.coreKind,
            assignmentCharge: 'ejecucion',
            clientId: clientId ?? undefined,
            projectId: dto.projectId ?? undefined,
            branchName: dto.sucursal?.trim().slice(0, 160) || undefined,
            creadoPorId: actor.id,
            responsableId,
            tiempoEstimadoMin: minutos,
            // Ya trae su estándar: no se le pregunta a la IA por cada renglón.
            tiempoEstandarMin: minutos,
            estandarDesglose: [{ concepto: `Formato «${formato.nombre}»`, minutos }],
            fechaInicio: p.fechaInicio.toISOString(),
            ...(p.periodo
              ? { periodoInicio: p.periodo.inicio, periodoFin: p.periodo.fin }
              : { fechaEntregaEsperada: p.fechaEntrega.toISOString(), fechaMaxima: p.fechaEntrega.toISOString() }),
            evidencePhotoRequired: r.fotos,
          } as unknown as CreateActivityDto,
          tenantId,
          { sinAviso: true },
        );
        creadas.push(creada.id);
        await this.prisma.formatoAplicacion.update({ where: { id: aplicacion.id }, data: { actividades: creadas } });
        for (const userId of equipo) {
          await this.team.addMember(creada.id, { userId, rol: 'TECNICO' }, tenantId, actor.id, { sinAviso: true });
        }
        if (r.puntos.length) await this.campos.definirCampos(creada.id, r.puntos, tenantId);
        if (r.herramientas.length) {
          await this.herramientas.definirRequisitos(
            creada.id,
            { requisitos: r.herramientas, allowedKitUserIds: personas },
            tenantId,
          );
        }
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'No se pudo crear';
        this.logger.warn(`Formato ${id}, renglón «${r.titulo}»: ${motivo}`);
        fallidas.push({ titulo: r.titulo, motivo });
      }
    }

    if (creadas.length) {
      await this.prisma.formatoActividad.update({
        where: { id },
        data: { usos: { increment: 1 }, ultimoUsoAt: new Date() },
      });
      await this.avisar(formato.nombre, creadas, personas, actor, tenantId);
    }
    return this.respuesta(creadas, tenantId, fallidas);
  }

  /** Un solo aviso por persona, no uno por renglón. */
  private async avisar(nombre: string, ids: number[], personas: number[], actor: ActorFormato, companyId: number) {
    const n = ids.length;
    for (const userId of personas) {
      await this.notifications
        .createNotification({
          userId,
          type: 'ACTIVITY_ASSIGNED',
          category: 'activities',
          title: n === 1 ? `Te asignaron una actividad de «${nombre}»` : `Te asignaron ${n} actividades de «${nombre}»`,
          message: `${actor.nombre?.trim() || 'Tu encargado'} te las dejó. Ábrelas para ver qué sigue.`,
          entityType: 'Activity',
          relatedEntityId: ids[0],
          relatedUrl: n === 1 ? appUrls.erpActividad(ids[0]) : appUrls.erpMisActividades(),
          triggerUserId: actor.id,
          companyId,
          dedupeSeconds: 0,
        })
        .catch((e) => this.logger.warn(`Aviso de formato: ${(e as Error).message}`));
    }
  }

  private async respuesta(ids: number[], companyId: number, fallidas: Array<{ titulo: string; motivo: string }>) {
    const actividades = ids.length
      ? await this.prisma.activity.findMany({
          where: { id: { in: ids }, companyId },
          select: { id: true, anNumber: true, titulo: true },
          orderBy: { id: 'asc' },
        })
      : [];
    return { actividades, fallidas };
  }
}
