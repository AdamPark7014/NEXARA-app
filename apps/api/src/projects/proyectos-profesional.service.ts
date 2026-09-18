/**
 * El proyecto completo: plan, alcance, requerimientos, equipo y documentos.
 *
 * `OperationalProjectsService` sigue llevando lo que ya llevaba (el espejo comercial,
 * los ingenieros, crear actividades por sitio). Aquí vive todo lo que un proyecto
 * necesita para dejar de ser «un nombre, un cliente y un vendedor»: el cronograma, las
 * tres caras del alcance, el checklist de requerimientos, el equipo con su papel y los
 * documentos. El avance y la salud no se guardan en ningún sitio: se calculan al leer.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertCompanyAccess,
  companyWhere,
  requireCompanyId,
  resolveRequiredCompanyId,
} from '../common/tenant/tenant-scope.js';
import { fueraDeAlcance, mensajeFueraDeAlcance } from './proyecto-equipo-alcance.js';
import type { Alcanzador } from '../me/equipo-alcance.js';
import {
  calcularSalud,
  resumirRequerimientos,
  siguienteHito,
  type ResumenSalud,
} from './proyecto-salud.js';
import {
  esEstadoProyecto,
  etiquetaEstadoProyecto,
  etiquetaRolEquipo,
  puedeTransicionar,
  PROYECTO_ESTADOS,
} from './proyecto-estado.js';
import type {
  ActualizarProyectoProfesionalDto,
  CrearProyectoProfesionalDto,
  ProjectMemberInputDto,
  ProjectMilestoneInputDto,
  ProjectRequirementInputDto,
  ProjectScopeItemInputDto,
  UpdateProjectMemberDto,
  UpdateProjectMilestoneDto,
  UpdateProjectRequirementDto,
  UpdateProjectScopeItemDto,
} from './dto/proyecto-profesional.dto.js';

const personaSelect = { id: true, nombre: true, email: true, avatarUrl: true } as const;

const detalleInclude = {
  vendor: { select: personaSelect },
  responsable: { select: personaSelect },
  client: { select: { id: true, name: true, contactEmail: true, contactPhone: true } },
  salesProject: { select: { id: true, name: true, status: true } },
  cotizacion: {
    select: { id: true, quoteNumber: true, status: true, total: true, currency: true, folioEnviado: true },
  },
  milestones: {
    include: { responsable: { select: personaSelect } },
    orderBy: [{ orden: 'asc' as const }, { plannedDate: 'asc' as const }, { id: 'asc' as const }],
  },
  scopeItems: { orderBy: [{ kind: 'asc' as const }, { orden: 'asc' as const }, { id: 'asc' as const }] },
  requirements: {
    include: { responsable: { select: personaSelect } },
    orderBy: [{ orden: 'asc' as const }, { id: 'asc' as const }],
  },
  members: {
    include: { user: { select: { ...personaSelect, puesto: true } } },
    orderBy: [{ role: 'asc' as const }, { id: 'asc' as const }],
  },
  documents: {
    include: { uploadedBy: { select: personaSelect } },
    orderBy: { createdAt: 'desc' as const },
  },
  activities: {
    select: {
      id: true,
      anNumber: true,
      titulo: true,
      estatus: true,
      prioridad: true,
      ticketType: true,
      activityType: true,
      branchName: true,
      branchNumber: true,
      fechaInicio: true,
      fechaEntregaEsperada: true,
      fechaFinalizacion: true,
      responsable: { select: personaSelect },
    },
    orderBy: { fechaAsignacion: 'desc' as const },
  },
} satisfies Prisma.OperationalProjectInclude;

/** Lo mínimo para pintar una fila de la lista sin traerse el proyecto entero. */
const listaInclude = {
  vendor: { select: personaSelect },
  responsable: { select: personaSelect },
  client: { select: { id: true, name: true } },
  cotizacion: { select: { id: true, quoteNumber: true } },
  activities: { select: { id: true, estatus: true } },
  milestones: {
    select: { id: true, name: true, orden: true, plannedDate: true, actualDate: true, status: true },
  },
  requirements: { select: { status: true } },
  _count: { select: { documents: true, members: true } },
} satisfies Prisma.OperationalProjectInclude;

export type FiltrosProyecto = {
  clientId?: number;
  vendorId?: number;
  responsableId?: number;
  status?: string;
  /** `riesgo` filtra por la salud calculada, no por una columna. */
  salud?: string;
  q?: string;
  incluirCancelados?: boolean;
};

@Injectable()
export class ProyectosProfesionalService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  private resumen(proyecto: {
    status: string;
    endDate: Date | null;
    actualEndDate: Date | null;
    activities?: Array<{ estatus?: string | null }>;
    milestones?: Array<{ plannedDate?: Date | null; actualDate?: Date | null; status?: string | null }>;
    requirements?: Array<{ status?: string | null }>;
  }): ResumenSalud & { requerimientos: ReturnType<typeof resumirRequerimientos>; estadoEtiqueta: string } {
    const salud = calcularSalud({
      status: proyecto.status,
      endDate: proyecto.endDate,
      actualEndDate: proyecto.actualEndDate,
      actividades: proyecto.activities ?? [],
      hitos: proyecto.milestones ?? [],
    });
    return {
      ...salud,
      requerimientos: resumirRequerimientos(proyecto.requirements ?? []),
      estadoEtiqueta: etiquetaEstadoProyecto(proyecto.status),
    };
  }

  async listar(filtros: FiltrosProyecto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: Prisma.OperationalProjectWhereInput = {
      ...(companyWhere(tenantId) as Prisma.OperationalProjectWhereInput),
      deletedAt: null,
    };
    if (filtros.clientId) where.clientId = filtros.clientId;
    if (filtros.vendorId) where.vendorId = filtros.vendorId;
    if (filtros.responsableId) where.responsableId = filtros.responsableId;
    if (filtros.status && esEstadoProyecto(filtros.status)) where.status = filtros.status;
    if (!filtros.status && !filtros.incluirCancelados) where.status = { not: 'CANCELLED' };
    if (filtros.q?.trim()) {
      const q = filtros.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { scopeSummary: { contains: q, mode: 'insensitive' } },
        { client: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const filas = await this.prisma.operationalProject.findMany({
      where,
      include: listaInclude,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });

    const conResumen = filas.map((p) => {
      const resumen = this.resumen(p as any);
      const { activities, milestones, requirements, _count, ...cabecera } = p as any;
      const siguiente = siguienteHito<{
        id: number;
        name: string;
        plannedDate: Date | null;
        actualDate: Date | null;
        status: string;
        orden: number;
      }>(milestones ?? []);
      return {
        ...cabecera,
        budgetAmount: cabecera.budgetAmount == null ? null : Number(cabecera.budgetAmount),
        documentosCount: _count?.documents ?? 0,
        equipoCount: _count?.members ?? 0,
        hitosCount: milestones?.length ?? 0,
        // La etapa que sigue, para que la lista diga «qué toca» sin abrir el proyecto.
        proximoHito: siguiente
          ? { id: siguiente.id, name: siguiente.name, plannedDate: siguiente.plannedDate, status: siguiente.status }
          : null,
        resumen,
      };
    });

    // La salud se calcula, así que filtrar por ella se hace aquí y no en SQL.
    const salud = filtros.salud?.trim().toUpperCase();
    if (!salud) return conResumen;
    if (salud === 'RIESGO') return conResumen.filter((p) => p.resumen.enRiesgo);
    return conResumen.filter((p) => p.resumen.salud === salud);
  }

  async detalle(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const proyecto = await this.prisma.operationalProject.findFirst({
      where: { id, ...(companyWhere(tenantId) as Prisma.OperationalProjectWhereInput) },
      include: detalleInclude,
    });
    assertCompanyAccess(proyecto as any, tenantId, 'Proyecto');

    const p = proyecto as NonNullable<typeof proyecto>;
    return {
      ...p,
      budgetAmount: p.budgetAmount == null ? null : Number(p.budgetAmount),
      cotizacion: p.cotizacion
        ? { ...p.cotizacion, total: p.cotizacion.total == null ? null : Number(p.cotizacion.total) }
        : null,
      members: p.members.map((m) => ({ ...m, rolEtiqueta: etiquetaRolEquipo(m.role) })),
      resumen: this.resumen(p as any),
    };
  }

  /** Estados y papeles disponibles, para que la interfaz no los repita a mano. */
  vocabulario() {
    return {
      estados: PROYECTO_ESTADOS.map((e) => ({ valor: e, etiqueta: etiquetaEstadoProyecto(e) })),
    };
  }

  // ---------------------------------------------------------------------------
  // Alcance de equipo
  // ---------------------------------------------------------------------------

  private async actorDeAlcance(actor: { id: number; isSuperAdmin?: boolean }): Promise<Alcanzador> {
    const fila = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, email: true, roleKey: true },
    });
    return {
      id: actor.id,
      email: fila?.email ?? null,
      roleKey: fila?.roleKey ?? null,
      isSuperAdmin: Boolean(actor.isSuperAdmin),
    };
  }

  /**
   * Solo puedes poner en un proyecto a gente a la que alcanzas. Se valida en el
   * servidor y no solo en el desplegable: el desplegable lo puede saltar cualquiera.
   */
  private async assertAlcanzaA(
    actor: { id: number; isSuperAdmin?: boolean } | null | undefined,
    ids: Array<number | null | undefined>,
  ) {
    const objetivo = ids.filter((id): id is number => Number.isInteger(id) && (id as number) > 0);
    if (!objetivo.length || !actor?.id) return;

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, nombre: true, email: true, managerId: true },
    });
    const alcanzador = await this.actorDeAlcance(actor);
    const fuera = fueraDeAlcance(alcanzador, users as any, objetivo);
    if (fuera.length) throw new ForbiddenException(mensajeFueraDeAlcance(fuera, users));
  }

  // ---------------------------------------------------------------------------
  // Alta
  // ---------------------------------------------------------------------------

  private fecha(valor: string | null | undefined): Date | null {
    if (!valor) return null;
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: ${valor}`);
    return d;
  }

  async crear(
    dto: CrearProyectoProfesionalDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const client = await this.prisma.serviceClient.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const tenantId = await resolveRequiredCompanyId(this.prisma, companyId ?? client.companyId);
    // Un cliente de otra empresa no se puede ligar: se contesta igual que si no existiera.
    if (client.companyId !== tenantId) throw new NotFoundException('Cliente no encontrado');

    const startDate = this.fecha(dto.startDate)!;
    const endDate = this.fecha(dto.endDate ?? null);
    if (endDate && endDate < startDate) {
      throw new BadRequestException('El fin planeado no puede ser anterior al inicio planeado');
    }

    const estado = dto.status && esEstadoProyecto(dto.status) ? dto.status : 'PLANNED';
    const responsableId = dto.responsableId ?? actor.id;
    const vendorId = dto.vendorId ?? actor.id;

    const miembros = this.normalizarEquipo(dto.members ?? [], responsableId);
    await this.assertAlcanzaA(actor, [responsableId, ...miembros.map((m) => m.userId)]);
    await this.assertAlcanzaA(actor, (dto.milestones ?? []).map((h) => h.responsableId));
    await this.assertAlcanzaA(actor, (dto.requirements ?? []).map((r) => r.responsableId));

    let cotizacionId: number | null = null;
    let alcanceHeredado: ProjectScopeItemInputDto[] = [];
    if (dto.cotizacionId) {
      const cotizacion = await this.prisma.cotizacion.findFirst({
        where: { id: dto.cotizacionId, ...(companyWhere(tenantId) as any) },
        select: { id: true, alcanceBloques: true, objetivo: true, scope: true },
      });
      if (!cotizacion) throw new NotFoundException('Cotización no encontrada');
      cotizacionId = cotizacion.id;
      if (dto.importarAlcanceDeCotizacion) {
        alcanceHeredado = alcanceDeCotizacion(cotizacion.alcanceBloques, cotizacion.scope);
      }
    }

    const scopeItems = [...(dto.scopeItems ?? []), ...alcanceHeredado];

    const creado = await this.prisma.operationalProject.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        objective: dto.objective?.trim() || null,
        scopeSummary: dto.scopeSummary?.trim() || null,
        projectType: dto.projectType ?? 'OTRO',
        siteCount: dto.siteCount ?? null,
        status: estado,
        vendorId,
        responsableId,
        clientId: dto.clientId,
        companyId: tenantId,
        startDate,
        endDate,
        actualStartDate: this.fecha(dto.actualStartDate ?? null),
        budgetAmount: dto.budgetAmount == null ? null : new Prisma.Decimal(dto.budgetAmount),
        currency: (dto.currency || 'MXN').toUpperCase().slice(0, 10),
        cotizacionId,
        salesProjectId: dto.salesProjectId ?? null,
        milestones: {
          create: (dto.milestones ?? []).map((h, i) => this.datosHito(h, i)),
        },
        scopeItems: {
          create: scopeItems.map((s, i) => ({
            kind: s.kind ?? 'ENTREGABLE',
            titulo: s.titulo.trim().slice(0, 240),
            detalle: s.detalle?.trim() || null,
            orden: s.orden ?? i,
            origenClave: s.origenClave ?? null,
          })),
        },
        requirements: {
          create: (dto.requirements ?? []).map((r, i) => this.datosRequerimiento(r, i)),
        },
        members: { create: miembros },
      },
      include: detalleInclude,
    });

    return this.detalle(creado.id, tenantId);
  }

  /** El responsable siempre va en el equipo, y solo una vez por persona. */
  private normalizarEquipo(
    entrada: ProjectMemberInputDto[],
    responsableId: number,
  ): Array<{ userId: number; role: any; notas: string | null }> {
    const porUsuario = new Map<number, { userId: number; role: any; notas: string | null }>();
    porUsuario.set(responsableId, { userId: responsableId, role: 'RESPONSABLE', notas: null });
    for (const m of entrada) {
      if (!Number.isInteger(m.userId) || m.userId <= 0) continue;
      if (m.userId === responsableId) continue;
      porUsuario.set(m.userId, {
        userId: m.userId,
        role: m.role ?? 'APOYO',
        notas: m.notas?.trim() || null,
      });
    }
    return [...porUsuario.values()];
  }

  private datosHito(h: ProjectMilestoneInputDto, i: number) {
    return {
      name: h.name.trim().slice(0, 200),
      description: h.description?.trim() || null,
      orden: h.orden ?? i,
      plannedDate: this.fecha(h.plannedDate ?? null),
      actualDate: this.fecha(h.actualDate ?? null),
      responsableId: h.responsableId ?? null,
      status: h.status ?? (h.actualDate ? 'CUMPLIDO' : 'PENDIENTE'),
    };
  }

  private datosRequerimiento(r: ProjectRequirementInputDto, i: number) {
    const status = r.status ?? 'PENDIENTE';
    return {
      titulo: r.titulo.trim().slice(0, 240),
      detalle: r.detalle?.trim() || null,
      orden: r.orden ?? i,
      responsableId: r.responsableId ?? null,
      status,
      dueDate: this.fecha(r.dueDate ?? null),
      completedAt: status === 'CUMPLIDO' ? new Date() : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Cabecera
  // ---------------------------------------------------------------------------

  async actualizar(
    id: number,
    dto: ActualizarProyectoProfesionalDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const actual = await this.cargar(id, tenantId);

    if (dto.responsableId !== undefined && dto.responsableId !== null) {
      await this.assertAlcanzaA(actor, [dto.responsableId]);
    }

    const startDate = dto.startDate !== undefined ? this.fecha(dto.startDate) : undefined;
    const endDate = dto.endDate !== undefined ? this.fecha(dto.endDate) : undefined;
    const inicio = startDate ?? actual.startDate;
    const fin = endDate !== undefined ? endDate : actual.endDate;
    if (inicio && fin && fin < inicio) {
      throw new BadRequestException('El fin planeado no puede ser anterior al inicio planeado');
    }

    await this.prisma.operationalProject.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.objective !== undefined && { objective: dto.objective?.trim() || null }),
        ...(dto.scopeSummary !== undefined && { scopeSummary: dto.scopeSummary?.trim() || null }),
        ...(dto.projectType !== undefined && { projectType: dto.projectType }),
        ...(dto.siteCount !== undefined && { siteCount: dto.siteCount ?? null }),
        ...(dto.responsableId !== undefined && { responsableId: dto.responsableId ?? null }),
        ...(startDate !== undefined && startDate !== null && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(dto.actualStartDate !== undefined && { actualStartDate: this.fecha(dto.actualStartDate) }),
        ...(dto.actualEndDate !== undefined && { actualEndDate: this.fecha(dto.actualEndDate) }),
        ...(dto.budgetAmount !== undefined && {
          budgetAmount: dto.budgetAmount == null ? null : new Prisma.Decimal(dto.budgetAmount),
        }),
        ...(dto.currency !== undefined && { currency: (dto.currency || 'MXN').toUpperCase().slice(0, 10) }),
        ...(dto.cotizacionId !== undefined && { cotizacionId: dto.cotizacionId ?? null }),
      },
    });

    // Quien lleva el proyecto está siempre en su equipo.
    if (dto.responsableId) {
      await this.prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId: dto.responsableId } },
        create: { projectId: id, userId: dto.responsableId, role: 'RESPONSABLE' },
        update: { role: 'RESPONSABLE' },
      });
    }

    return this.detalle(id, tenantId);
  }

  private async cargar(id: number, tenantId: number) {
    const fila = await this.prisma.operationalProject.findFirst({
      where: { id, ...(companyWhere(tenantId) as Prisma.OperationalProjectWhereInput) },
    });
    assertCompanyAccess(fila as any, tenantId, 'Proyecto');
    return fila as NonNullable<typeof fila>;
  }

  /** Comprueba que el hijo es de este proyecto antes de tocarlo (y que el proyecto es tuyo). */
  private async assertDelProyecto(projectId: number, tenantId: number) {
    await this.cargar(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Cronograma
  // ---------------------------------------------------------------------------

  async agregarHito(
    projectId: number,
    dto: ProjectMilestoneInputDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    await this.assertAlcanzaA(actor, [dto.responsableId]);

    const ultimo = await this.prisma.projectMilestone.findFirst({
      where: { projectId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    await this.prisma.projectMilestone.create({
      data: { projectId, ...this.datosHito(dto, (ultimo?.orden ?? -1) + 1) },
    });
    return this.detalle(projectId, tenantId);
  }

  async actualizarHito(
    projectId: number,
    hitoId: number,
    dto: UpdateProjectMilestoneDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const hito = await this.prisma.projectMilestone.findFirst({ where: { id: hitoId, projectId } });
    if (!hito) throw new NotFoundException('Hito no encontrado');
    if (dto.responsableId) await this.assertAlcanzaA(actor, [dto.responsableId]);

    const actualDate = dto.actualDate !== undefined ? this.fecha(dto.actualDate) : undefined;
    await this.prisma.projectMilestone.update({
      where: { id: hitoId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim().slice(0, 200) }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
        ...(dto.plannedDate !== undefined && { plannedDate: this.fecha(dto.plannedDate) }),
        ...(actualDate !== undefined && { actualDate }),
        ...(dto.responsableId !== undefined && { responsableId: dto.responsableId ?? null }),
        // Poner la fecha real es dar el hito por cumplido: nadie va a marcar además el estado.
        ...(dto.status !== undefined
          ? { status: dto.status }
          : actualDate
            ? { status: 'CUMPLIDO' as const }
            : {}),
      },
    });
    return this.detalle(projectId, tenantId);
  }

  async borrarHito(projectId: number, hitoId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const borradas = await this.prisma.projectMilestone.deleteMany({ where: { id: hitoId, projectId } });
    if (!borradas.count) throw new NotFoundException('Hito no encontrado');
    return this.detalle(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Alcance
  // ---------------------------------------------------------------------------

  async agregarAlcance(projectId: number, dto: ProjectScopeItemInputDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const ultimo = await this.prisma.projectScopeItem.findFirst({
      where: { projectId, kind: dto.kind ?? 'ENTREGABLE' },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    await this.prisma.projectScopeItem.create({
      data: {
        projectId,
        kind: dto.kind ?? 'ENTREGABLE',
        titulo: dto.titulo.trim().slice(0, 240),
        detalle: dto.detalle?.trim() || null,
        orden: dto.orden ?? (ultimo?.orden ?? -1) + 1,
        origenClave: dto.origenClave ?? null,
      },
    });
    return this.detalle(projectId, tenantId);
  }

  async actualizarAlcance(
    projectId: number,
    itemId: number,
    dto: UpdateProjectScopeItemDto,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const item = await this.prisma.projectScopeItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw new NotFoundException('Renglón de alcance no encontrado');
    await this.prisma.projectScopeItem.update({
      where: { id: itemId },
      data: {
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.titulo !== undefined && { titulo: dto.titulo.trim().slice(0, 240) }),
        ...(dto.detalle !== undefined && { detalle: dto.detalle?.trim() || null }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
      },
    });
    return this.detalle(projectId, tenantId);
  }

  async borrarAlcance(projectId: number, itemId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const borradas = await this.prisma.projectScopeItem.deleteMany({ where: { id: itemId, projectId } });
    if (!borradas.count) throw new NotFoundException('Renglón de alcance no encontrado');
    return this.detalle(projectId, tenantId);
  }

  /**
   * Volcar el alcance de la cotización ligada. Es idempotente: cada bloque trae su
   * clave de origen y no se duplica si se vuelve a pulsar.
   */
  async importarAlcanceDeCotizacion(projectId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const proyecto = await this.cargar(projectId, tenantId);
    if (!proyecto.cotizacionId) {
      throw new BadRequestException('El proyecto no tiene una cotización ligada');
    }
    const cotizacion = await this.prisma.cotizacion.findFirst({
      where: { id: proyecto.cotizacionId, ...(companyWhere(tenantId) as any) },
      select: { id: true, alcanceBloques: true, scope: true },
    });
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');

    const bloques = alcanceDeCotizacion(cotizacion.alcanceBloques, cotizacion.scope);
    const existentes = new Set(
      (
        await this.prisma.projectScopeItem.findMany({
          where: { projectId, origenClave: { not: null } },
          select: { origenClave: true },
        })
      ).map((s) => s.origenClave),
    );
    const nuevos = bloques.filter((b) => !existentes.has(b.origenClave ?? null));
    if (nuevos.length) {
      const ultimo = await this.prisma.projectScopeItem.findFirst({
        where: { projectId },
        orderBy: { orden: 'desc' },
        select: { orden: true },
      });
      let orden = (ultimo?.orden ?? -1) + 1;
      await this.prisma.projectScopeItem.createMany({
        data: nuevos.map((b) => ({
          projectId,
          kind: b.kind ?? 'ENTREGABLE',
          titulo: b.titulo.slice(0, 240),
          detalle: b.detalle ?? null,
          orden: orden++,
          origenClave: b.origenClave ?? null,
        })),
      });
    }
    return this.detalle(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Requerimientos
  // ---------------------------------------------------------------------------

  async agregarRequerimiento(
    projectId: number,
    dto: ProjectRequirementInputDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    await this.assertAlcanzaA(actor, [dto.responsableId]);
    const ultimo = await this.prisma.projectRequirement.findFirst({
      where: { projectId },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });
    await this.prisma.projectRequirement.create({
      data: { projectId, ...this.datosRequerimiento(dto, (ultimo?.orden ?? -1) + 1) },
    });
    return this.detalle(projectId, tenantId);
  }

  async actualizarRequerimiento(
    projectId: number,
    reqId: number,
    dto: UpdateProjectRequirementDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const req = await this.prisma.projectRequirement.findFirst({ where: { id: reqId, projectId } });
    if (!req) throw new NotFoundException('Requerimiento no encontrado');
    if (dto.responsableId) await this.assertAlcanzaA(actor, [dto.responsableId]);

    await this.prisma.projectRequirement.update({
      where: { id: reqId },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo.trim().slice(0, 240) }),
        ...(dto.detalle !== undefined && { detalle: dto.detalle?.trim() || null }),
        ...(dto.orden !== undefined && { orden: dto.orden }),
        ...(dto.responsableId !== undefined && { responsableId: dto.responsableId ?? null }),
        ...(dto.dueDate !== undefined && { dueDate: this.fecha(dto.dueDate) }),
        ...(dto.status !== undefined && {
          status: dto.status,
          // La fecha de cumplimiento la pone el sistema, no el usuario: así no se retoca.
          completedAt: dto.status === 'CUMPLIDO' ? (req.completedAt ?? new Date()) : null,
        }),
      },
    });
    return this.detalle(projectId, tenantId);
  }

  async borrarRequerimiento(projectId: number, reqId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const borradas = await this.prisma.projectRequirement.deleteMany({ where: { id: reqId, projectId } });
    if (!borradas.count) throw new NotFoundException('Requerimiento no encontrado');
    return this.detalle(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Equipo
  // ---------------------------------------------------------------------------

  async agregarMiembro(
    projectId: number,
    dto: ProjectMemberInputDto,
    actor: { id: number; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    await this.assertAlcanzaA(actor, [dto.userId]);

    const persona = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException('Persona no encontrada o dada de baja');

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: {
        projectId,
        userId: dto.userId,
        role: dto.role ?? 'APOYO',
        notas: dto.notas?.trim() || null,
      },
      update: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.notas !== undefined && { notas: dto.notas?.trim() || null }),
      },
    });

    if (dto.role === 'RESPONSABLE') {
      await this.prisma.operationalProject.update({
        where: { id: projectId },
        data: { responsableId: dto.userId },
      });
    }
    return this.detalle(projectId, tenantId);
  }

  async actualizarMiembro(
    projectId: number,
    userId: number,
    dto: UpdateProjectMemberDto,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const miembro = await this.prisma.projectMember.findFirst({ where: { projectId, userId } });
    if (!miembro) throw new NotFoundException('La persona no está en el equipo de este proyecto');

    await this.prisma.projectMember.update({
      where: { id: miembro.id },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.notas !== undefined && { notas: dto.notas?.trim() || null }),
      },
    });
    if (dto.role === 'RESPONSABLE') {
      await this.prisma.operationalProject.update({
        where: { id: projectId },
        data: { responsableId: userId },
      });
    }
    return this.detalle(projectId, tenantId);
  }

  async quitarMiembro(projectId: number, userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const proyecto = await this.cargar(projectId, tenantId);
    if (proyecto.responsableId === userId) {
      throw new BadRequestException(
        'No se puede sacar al responsable del proyecto: primero nombra a otro responsable',
      );
    }
    const borradas = await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    if (!borradas.count) throw new NotFoundException('La persona no está en el equipo de este proyecto');
    return this.detalle(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Documentos
  // ---------------------------------------------------------------------------

  async agregarDocumentos(
    projectId: number,
    archivos: Array<{ url: string; nombre: string; mimeType?: string | null; size?: number | null }>,
    kind: string | undefined,
    actorId: number | null,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    if (!archivos.length) throw new BadRequestException('No hay archivos');

    await this.prisma.projectDocument.createMany({
      data: archivos.map((a) => ({
        projectId,
        kind: (kind as any) || 'OTRO',
        nombre: a.nombre.slice(0, 220),
        fileUrl: a.url,
        mimeType: a.mimeType?.slice(0, 120) ?? null,
        fileSizeBytes: a.size ?? null,
        uploadedById: actorId,
      })),
    });
    return this.detalle(projectId, tenantId);
  }

  async borrarDocumento(projectId: number, docId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.assertDelProyecto(projectId, tenantId);
    const borradas = await this.prisma.projectDocument.deleteMany({ where: { id: docId, projectId } });
    if (!borradas.count) throw new NotFoundException('Documento no encontrado');
    return this.detalle(projectId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  /** Comprueba la transición antes de tocar nada, para dar un mensaje que se entienda. */
  assertTransicion(desde: string, hacia: string) {
    if (!esEstadoProyecto(hacia)) {
      throw new BadRequestException(
        `Estado inválido. Debe ser uno de: ${PROYECTO_ESTADOS.join(', ')}`,
      );
    }
    if (!puedeTransicionar(desde, hacia)) {
      throw new BadRequestException(
        `No se puede pasar de «${etiquetaEstadoProyecto(desde)}» a «${etiquetaEstadoProyecto(hacia)}»`,
      );
    }
  }
}

/**
 * El alcance de la cotización, traducido a renglones de proyecto.
 *
 * La cotización guarda sus bloques en un JSON (`alcanceBloques`) con la forma
 * `{ clave, titulo, texto, parametros }`. Aquí solo se lee: la cotización es de otro
 * módulo y no se toca.
 */
export function alcanceDeCotizacion(
  alcanceBloques: unknown,
  scopeLibre?: string | null,
): ProjectScopeItemInputDto[] {
  const items: ProjectScopeItemInputDto[] = [];
  if (Array.isArray(alcanceBloques)) {
    for (const bloque of alcanceBloques) {
      if (!bloque || typeof bloque !== 'object') continue;
      const b = bloque as Record<string, unknown>;
      const titulo = typeof b.titulo === 'string' ? b.titulo.trim() : '';
      if (!titulo) continue;
      const clave = typeof b.clave === 'string' && b.clave ? b.clave : `cotizacion:${titulo}`;
      items.push({
        kind: 'ENTREGABLE',
        titulo,
        detalle: typeof b.texto === 'string' && b.texto.trim() ? b.texto.trim() : undefined,
        origenClave: clave.slice(0, 80),
      });
    }
  }
  // Las cotizaciones viejas traían el alcance en un solo campo de texto.
  if (!items.length && typeof scopeLibre === 'string' && scopeLibre.trim()) {
    items.push({
      kind: 'ENTREGABLE',
      titulo: scopeLibre.trim().slice(0, 240),
      origenClave: 'cotizacion:scope',
    });
  }
  return items;
}
