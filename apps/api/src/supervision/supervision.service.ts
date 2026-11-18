import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ROLES, ROLES_ENCARGADOS_DE_AREA, type RoleKey } from '../common/rbac/roles.v2.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { WORKDAY_TIMEZONE, workClock, workDateKey } from '../common/time/workday.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { esJefe, subarbolIds } from '../me/equipo-alcance.js';
import { horarioDePersona, retardoDeEntrada } from '../me/kpis-equipo.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  actividadCubreFecha,
  clasificarEstatusActividad,
  esCuentaRealParaAviso,
  mananaIso,
  parseFechaIso,
} from './supervision-helpers.js';
import {
  indicadoresDeRenglones,
  normalizarRenglones,
  renglonesDesdeTextoLibre,
  textoResumenDeRenglones,
  type PlanRenglon,
} from './plan-renglones.js';
import { ActivitiesService } from '../activities/activities.service.js';
import type { Prisma } from '@prisma/client';

export type SupervisionActor = {
  id: number;
  email: string;
  nombre: string;
  roleKey: string | null;
  isActive: boolean;
  managerId: number | null;
  puesto: string | null;
  isSuperAdmin?: boolean;
};

type Sesion = {
  id?: number | string | null;
  isClient?: boolean;
  isBranchUser?: boolean;
  isSuperAdmin?: boolean;
};

type UsuarioOrg = {
  id: number;
  nombre: string;
  email: string;
  roleKey: string | null;
  managerId: number | null;
  puesto: string | null;
  isActive: boolean;
  tipoContrato?: string | null;
  orgRoleKey?: string | null;
  horario?: {
    horaEntrada: string | null;
    horaSalida: string | null;
    dias: number[];
    graciaMin: number | null;
  } | null;
};


@Injectable()
export class SupervisionService {
  private readonly logger = new Logger(SupervisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activities: ActivitiesService,
  ) {}



  async resolveActor(sesion: Sesion, companyId: number): Promise<SupervisionActor> {
    requireCompanyId(companyId);
    const id = Number(sesion?.id);
    if (!Number.isFinite(id) || id <= 0 || sesion?.isClient || sesion?.isBranchUser) {
      throw new ForbiddenException('Solo el personal interno puede usar supervisión.');
    }
    const actor = await this.prisma.user.findFirst({
      where: { id, companyMemberships: { some: { companyId } } },
      select: {
        id: true,
        email: true,
        nombre: true,
        roleKey: true,
        isActive: true,
        managerId: true,
        puesto: true,
      },
    });
    if (!actor || actor.isActive === false) {
      throw new ForbiddenException('Tu usuario no está activo.');
    }
    return { ...actor, isSuperAdmin: Boolean(sesion?.isSuperAdmin) };
  }

  private async usuariosEmpresa(companyId: number): Promise<UsuarioOrg[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId } } },
      select: {
        id: true,
        nombre: true,
        email: true,
        roleKey: true,
        managerId: true,
        puesto: true,
        isActive: true,
        tipoContrato: true,
        role: { select: { orgRoleKey: true } },
        horario: { select: { horaEntrada: true, horaSalida: true, dias: true, graciaMin: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((u) => ({
      ...u,
      orgRoleKey: u.role?.orgRoleKey ?? null,
      horario: u.horario,
    }));
  }

  puedeMandarPlan(
    actor: { id: number; roleKey?: string | null },
    users: Array<{ id: number; managerId: number | null }>,
  ): boolean {
    if (esJefe(actor.id, users)) return true;
    return [...ROLES_ENCARGADOS_DE_AREA, ROLES.COORD_ADMIN, ROLES.COORD_VENTAS].includes(String(actor.roleKey ?? '') as RoleKey);
  }

  async resolverSupervisorId(
    actor: { id: number; managerId: number | null },
    companyId: number,
  ): Promise<number> {
    if (actor.managerId != null && actor.managerId !== actor.id) {
      const jefe = await this.prisma.user.findFirst({
        where: { id: actor.managerId, isActive: true, companyMemberships: { some: { companyId } } },
        select: { id: true },
      });
      if (jefe) return jefe.id;
    }
    const luis = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        roleKey: ROLES.DIR_OPERACIONES,
        id: { not: actor.id },
        companyMemberships: { some: { companyId } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!luis) throw new BadRequestException('No hay supervisor general configurado.');
    return luis.id;
  }

  private esperadosDelSupervisor(supervisorId: number, users: UsuarioOrg[]): UsuarioOrg[] {
    return users.filter(
      (u) =>
        u.managerId === supervisorId &&
        this.puedeMandarPlan(u, users),
    );
  }

  private async avisar(
    userId: number,
    payload: {
      type: string;
      title: string;
      message: string;
      triggerUserId: number;
      relatedEntityId: number;
      companyId: number;
      relatedUrl?: string;
      entityType: string;
    },
  ) {
    const destino = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, companyMemberships: { some: { companyId: payload.companyId } } },
      select: { email: true, puesto: true },
    });
    if (!destino || !esCuentaRealParaAviso(destino)) return;
    await this.notifications
      .createNotification({
        userId,
        type: payload.type,
        category: 'supervision',
        title: payload.title,
        message: payload.message,
        triggerUserId: payload.triggerUserId,
        relatedEntityId: payload.relatedEntityId,
        entityType: payload.entityType,
        relatedUrl: payload.relatedUrl ?? '/erp/supervision',
        priority: 'high',
        companyId: payload.companyId,
        dedupeSeconds: 120,
        excludeActor: false,
      })
      .catch((err) =>
        this.logger.warn(`Aviso supervisión falló: ${err instanceof Error ? err.message : String(err)}`),
      );
  }

  async enviarPlan(
    sesion: Sesion,
    companyId: number | null,
    body: { fecha?: string; texto?: string; renglones?: unknown; pegarTexto?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    let renglones = normalizarRenglones(body?.renglones);
    if (!renglones.length && body?.pegarTexto) {
      renglones = renglonesDesdeTextoLibre(String(body.pegarTexto));
    }
    const textoLibre = String(body?.texto ?? '').trim();
    if (!renglones.length && textoLibre) {
      renglones = renglonesDesdeTextoLibre(textoLibre);
    }
    renglones = normalizarRenglones(renglones);
    const texto = renglones.length ? textoResumenDeRenglones(renglones) : textoLibre;
    if (texto.length < 3) {
      throw new BadRequestException('Agrega al menos un renglón con qué hará tu gente (mínimo 3 caracteres).');
    }
    const fecha = body?.fecha?.trim() || mananaIso();
    const fechaCol = parseFechaIso(fecha);
    const users = await this.usuariosEmpresa(tenantId);
    if (actor.roleKey === ROLES.CEO || !this.puedeMandarPlan(actor, users)) {
      throw new ForbiddenException(
        'Solo quien tiene gente a cargo o es encargado de área puede mandar el plan de mañana.',
      );
    }
    const supervisorId = await this.resolverSupervisorId(actor, tenantId);
    await this.validarReferenciasRenglones(renglones, actor.id, tenantId);
    // El vínculo se origina en el servidor, nunca en la petición del autor.
    renglones = renglones.map(r => ({ ...r, actividadCreadaId: null }));
    const previo = await this.prisma.planDiario.findFirst({ where: { autorId: actor.id, fecha: fechaCol, companyId: tenantId } });
    if (previo && (previo.estado === 'PROGRAMADO' || normalizarRenglones(previo.renglonesJson).some(r => r.actividadCreadaId))) throw new BadRequestException('El plan ya tiene programación. Solicita al supervisor los cambios para conservar las actividades ligadas.');
    const plan = await this.prisma.planDiario.upsert({
      where: { autorId_fecha: { autorId: actor.id, fecha: fechaCol }, companyId: tenantId, estado: { not: 'PROGRAMADO' } },
      create: {
        companyId: tenantId,
        autorId: actor.id,
        supervisorId,
        fecha: fechaCol,
        texto,
        renglonesJson: renglones,
        estado: 'ENVIADO',
        notaSupervisor: null,
      },
      update: {
        texto,
        renglonesJson: renglones,
        estado: 'ENVIADO',
        notaSupervisor: null,
        supervisorId,
      },
    }).catch(error => {
      if (error?.code === 'P2002' || error?.code === 'P2025') throw new BadRequestException('El plan ya fue programado o pertenece a otra empresa. Actualiza la pantalla.');
      throw error;
    });
    await this.avisar(supervisorId, {
      type: 'WORKFLOW_PENDING',
      title: 'Plan de mañana',
      message: `${actor.nombre} mandó el plan del ${fecha} (${renglones.length} renglones).`,
      triggerUserId: actor.id,
      relatedEntityId: plan.id,
      companyId: tenantId,
      entityType: 'PlanDiario',
    });
    return { ...plan, fecha, renglones, autor: { id: actor.id, nombre: actor.nombre } };
  }

  async listarPlanes(sesion: Sesion, companyId: number | null, fecha?: string) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const fechaIso = fecha?.trim() || mananaIso();
    const fechaCol = parseFechaIso(fechaIso);
    const users = await this.usuariosEmpresa(tenantId);
    const puedeEnviar = actor.roleKey !== ROLES.CEO && this.puedeMandarPlan(actor, users);
    const esSupervisor =
      actor.roleKey !== ROLES.CEO && (actor.roleKey === ROLES.DIR_OPERACIONES || users.some((u) => u.managerId === actor.id));

    if (esSupervisor) {
      const planes = await this.prisma.planDiario.findMany({
        where: { companyId: tenantId, supervisorId: actor.id, fecha: fechaCol },
        include: { autor: { select: { id: true, nombre: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      const enviados = new Set(planes.map((p) => p.autorId));
      const faltantes = this.esperadosDelSupervisor(actor.id, users)
        .filter((u) => !enviados.has(u.id))
        .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email }));
      const propios = await this.prisma.planDiario.findMany({
        where: { companyId: tenantId, autorId: actor.id, fecha: fechaCol },
        orderBy: { updatedAt: 'desc' },
      });
      const planesConRenglones = planes.map((p) => ({
        ...p,
        renglones: normalizarRenglones(p.renglonesJson),
      }));
      const equipoIds = [...subarbolIds(actor.id, users)].filter(id => id !== actor.id);
      const indicadores = indicadoresDeRenglones(
        planesConRenglones.map((p) => ({
          renglones: p.renglones,
          autorId: p.autorId,
          autorNombre: p.autor?.nombre,
        })),
        equipoIds,
      );
      return {
        rol: 'supervisor' as const,
        propios,
        puedeEnviar,
        puedeCerrar: actor.roleKey === ROLES.DIR_OPERACIONES,
        fecha: fechaIso,
        planes: planesConRenglones,
        faltantes,
        indicadores,
      };
    }

    const planes = await this.prisma.planDiario.findMany({
      where: { companyId: tenantId, autorId: actor.id, fecha: fechaCol },
      include: { supervisor: { select: { id: true, nombre: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      rol: 'autor' as const,
      puedeEnviar,
      puedeCerrar: actor.roleKey === ROLES.CEO,
      fecha: fechaIso,
      planes: planes.map((p) => ({ ...p, renglones: normalizarRenglones(p.renglonesJson) })),
      faltantes: [] as Array<{ id: number; nombre: string; email: string }>,
      indicadores: null,
    };
  }

  private async planDelSupervisor(id: number, actorId: number, companyId: number) {
    const plan = await this.prisma.planDiario.findFirst({ where: { id, companyId } });
    if (!plan) throw new NotFoundException('No encontré ese plan.');
    if (plan.supervisorId !== actorId) {
      throw new ForbiddenException('Solo el supervisor de ese plan puede cambiarlo.');
    }
    return plan;
  }

  async programarPlan(sesion: Sesion, companyId: number | null, id: number) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const plan = await this.planDelSupervisor(id, actor.id, tenantId);
    if (normalizarRenglones(plan.renglonesJson).some(r => !r.actividadCreadaId)) {
      throw new BadRequestException('Usa Programar o Programar todo para crear las actividades antes de marcar el plan como programado.');
    }
    return this.prisma.planDiario.update({
      where: { id, companyId: tenantId },
      data: { estado: 'PROGRAMADO', notaSupervisor: null },
    });
  }

  async devolverPlan(sesion: Sesion, companyId: number | null, id: number, nota?: string) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const plan = await this.planDelSupervisor(id, actor.id, tenantId);
    if (normalizarRenglones(plan.renglonesJson).some(r => r.actividadCreadaId)) {
      throw new BadRequestException('El plan tiene actividades programadas. Ajusta esas actividades antes de devolverlo.');
    }
    const notaSupervisor = String(nota ?? '').trim() || null;
    const updated = await this.prisma.planDiario.update({
      where: { id, companyId: tenantId, estado: plan.estado, updatedAt: plan.updatedAt },
      data: { estado: 'DEVUELTO', notaSupervisor },
    });
    await this.avisar(plan.autorId, {
      type: 'WORKFLOW_PENDING',
      title: 'Plan de mañana devuelto',
      message: notaSupervisor
        ? `${actor.nombre} devolvió tu plan: ${notaSupervisor}`
        : `${actor.nombre} devolvió tu plan de mañana. Revísalo y vuelve a mandarlo.`,
      triggerUserId: actor.id,
      relatedEntityId: plan.id,
      companyId: tenantId,
      entityType: 'PlanDiario',
    });
    return updated;
  }

  private async armarResumenPersonas(supervisorId: number, companyId: number, fechaIso: string) {
    const fechaCol = parseFechaIso(fechaIso);
    const users = await this.usuariosEmpresa(companyId);
    const arbol = subarbolIds(supervisorId, users);
    arbol.delete(supervisorId);
    const ids = [...arbol];
    if (!ids.length) {
      return {
        personas: [] as Array<{ userId: number; nombre: string; programadas: number; terminadas: number; en_revision: number; no_cumplidas: number; sin_empezar: number; en_curso: number; checo: boolean; retardo: boolean; minutosTarde: number; falta: boolean; actividades: Array<{ id: number; titulo: string; estatus: string; bucket: string }> }>,
        totales: {
          programadas: 0,
          terminadas: 0,
          en_revision: 0,
          no_cumplidas: 0,
          sin_empezar: 0,
          en_curso: 0,
          checadas: 0,
          retardos: 0,
          faltas: 0,
        },
      };
    }

    const actividades = await this.prisma.activity.findMany({
      where: { companyId, deletedAt: null, cancelledAt: null, OR: [{ responsableId: { in: ids } }, { assignees: { some: { userId: { in: ids }, retiradoAt: null, companyId } } }], estatus: { not: { equals: 'Cancelada' } } },
      select: {
        id: true,
        titulo: true,
        estatus: true,
        responsableId: true,
        periodoInicio: true,
        periodoFin: true,
        fechaInicio: true,
        fechaMaxima: true,
        fechaAsignacion: true,
        assignees: { where: { retiradoAt: null, companyId }, select: { userId: true, inicioRealAt: true } },
        activityEvidences: { where: { companyId }, select: { userId: true, status: true, reviewStatus: true } },
      },
    });
    const delDia = actividades.filter((a) => actividadCubreFecha(a, fechaIso));

    const entradas = await this.prisma.attendance.findMany({
      where: { companyId, userId: { in: ids }, workDate: fechaCol, type: 'entrada' },
      select: { userId: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
    });
    const entradaPorUser = new Map(entradas.map((e) => [e.userId, e.timestamp]));

    const porPersona = new Map<
      number,
      {
        userId: number;
        nombre: string;
        programadas: number;
        terminadas: number;
        en_revision: number;
        no_cumplidas: number;
        sin_empezar: number;
        en_curso: number;
        checo: boolean;
        retardo: boolean;
        minutosTarde: number;
        falta: boolean;
        actividades: Array<{ id: number; titulo: string; estatus: string; bucket: string }>;
      }
    >();

    for (const id of ids) {
      const u = users.find((x) => x.id === id);
      if (!u) continue;
      porPersona.set(id, {
        userId: id,
        nombre: u.nombre,
        programadas: 0,
        terminadas: 0,
        en_revision: 0,
        no_cumplidas: 0,
        sin_empezar: 0,
        en_curso: 0,
        checo: false,
        retardo: false,
        minutosTarde: 0,
        falta: false,
        actividades: [],
      });
    }

    for (const a of delDia) {
      const participantes = new Set([a.responsableId, ...(a.assignees ?? []).map((x) => x.userId)]);
      for (const userId of participantes) {
      const row = porPersona.get(userId);
      if (!row) continue;
      row.programadas += 1;
      const evidencia = a.activityEvidences?.find((e) => e.userId === userId);
      const asignado = a.assignees?.find((x) => x.userId === userId);
      const bucket = clasificarEstatusActividad(a.estatus, evidencia, asignado?.inicioRealAt);
      row.actividades.push({ id: a.id, titulo: a.titulo, estatus: a.estatus, bucket });
      if (bucket === 'terminada') row.terminadas += 1;
      else if (bucket === 'en_revision') row.en_revision += 1;
      else if (bucket === 'no_cumplida') row.no_cumplidas += 1;
      else if (bucket === 'sin_empezar') row.sin_empezar += 1;
      else row.en_curso += 1;
      }
    }

    for (const id of ids) {
      const u = users.find((x) => x.id === id);
      const row = porPersona.get(id);
      if (!u || !row) continue;
      const plantilla = resolveAccessScheduleKey({
        isActive: true,
        roleKey: u.roleKey,
        orgRoleKey: u.orgRoleKey ?? null,
        tipoContrato: u.tipoContrato,
      });
      const horario = horarioDePersona(plantilla, u.horario ?? null);
      const entrada = entradaPorUser.get(id);
      row.checo = Boolean(entrada);
      if (entrada && horario.entrada) {
        const r = retardoDeEntrada(entrada, horario);
        row.retardo = r.retardo;
        row.minutosTarde = r.minutosTarde;
      }
      const diaSemana = parseFechaIso(fechaIso).getUTCDay();
      const laborable = !horario.diasLaborables?.length || horario.diasLaborables.includes(diaSemana);
      row.falta = Boolean(laborable && horario.entrada && !entrada);
    }

    const personas = [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const totales = personas.reduce(
      (acc, p) => {
        acc.programadas += p.programadas;
        acc.terminadas += p.terminadas;
        acc.en_revision += p.en_revision;
        acc.no_cumplidas += p.no_cumplidas;
        acc.sin_empezar += p.sin_empezar;
        acc.en_curso += p.en_curso;
        if (p.checo) acc.checadas += 1;
        if (p.retardo) acc.retardos += 1;
        if (p.falta) acc.faltas += 1;
        return acc;
      },
      {
        programadas: 0,
        terminadas: 0,
        en_revision: 0,
        no_cumplidas: 0,
        sin_empezar: 0,
        en_curso: 0,
        checadas: 0,
        retardos: 0,
        faltas: 0,
      },
    );
    return { personas, totales };
  }

  async resumenCierre(sesion: Sesion, companyId: number | null, fecha?: string) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const fechaIso = fecha?.trim() || workDateKey(new Date());
    parseFechaIso(fechaIso);
    const fechaCol = parseFechaIso(fechaIso);

    if (actor.roleKey === ROLES.CEO) {
      const cierres = await this.prisma.cierreDiario.findMany({
        where: { companyId: tenantId, fecha: fechaCol },
        include: { supervisor: { select: { id: true, nombre: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return { rol: 'direccion' as const, fecha: fechaIso, cierres };
    }

    const users = await this.usuariosEmpresa(tenantId);
    const esSupervisor = actor.roleKey === ROLES.DIR_OPERACIONES;
    if (!esSupervisor) {
      throw new ForbiddenException('Solo el supervisor puede ver el cierre del día.');
    }

    const { personas, totales } = await this.armarResumenPersonas(actor.id, tenantId, fechaIso);
    const cierre = await this.prisma.cierreDiario.findFirst({
      where: { companyId: tenantId, supervisorId: actor.id, fecha: fechaCol },
    });
    const planVsReal = await this.compararPlanVsReal(actor.id, tenantId, fechaIso, personas);
    return {
      rol: 'supervisor' as const,
      fecha: fechaIso,
      personas,
      totales,
      planVsReal,
      cierre,
      puedeEntregar: !cierre,
    };
  }

  async entregarCierre(
    sesion: Sesion,
    companyId: number | null,
    body: { fecha?: string; comentario?: string },
  ) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const users = await this.usuariosEmpresa(tenantId);
    if (actor.roleKey !== ROLES.DIR_OPERACIONES) {
      throw new ForbiddenException('Solo el supervisor puede entregar el cierre a dirección.');
    }
    const fechaIso = body?.fecha?.trim() || workDateKey(new Date());
    const fechaCol = parseFechaIso(fechaIso);
    const { personas, totales } = await this.armarResumenPersonas(actor.id, tenantId, fechaIso);
    const comentario = String(body?.comentario ?? '').trim() || null;
    const resumenJson = { personas, totales };
    const cierre = await this.prisma.cierreDiario.upsert({
      where: { companyId: tenantId, supervisorId_fecha: { supervisorId: actor.id, fecha: fechaCol } },
      create: {
        companyId: tenantId,
        supervisorId: actor.id,
        fecha: fechaCol,
        comentario,
        resumenJson,
      },
      update: { comentario, resumenJson },
    });

    const direccion = await this.prisma.user.findMany({
      where: {
        roleKey: ROLES.CEO,
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true, email: true, puesto: true },
    });
    for (const ceo of direccion.filter(esCuentaRealParaAviso)) {
      await this.avisar(ceo.id, {
        type: 'WORKFLOW_PENDING',
        title: 'Cierre del día',
        message: `${actor.nombre} entregó el cierre del ${fechaIso}.`,
        triggerUserId: actor.id,
        relatedEntityId: cierre.id,
        companyId: tenantId,
        entityType: 'CierreDiario',
      });
    }
    return { ...cierre, fecha: fechaIso, resumen: resumenJson };
  }

  @Cron('0 17 * * 1-5', { name: 'supervision-plan-manana', timeZone: WORKDAY_TIMEZONE })
  async cronRecordarPlanes() {
    await runScheduledJob('supervision:plan-manana', this.logger, () => this.recordarPlanesManana());
  }

  @Cron('30 18 * * 1-5', { name: 'supervision-cierre-dia', timeZone: WORKDAY_TIMEZONE })
  async cronRecordarCierre() {
    await runScheduledJob('supervision:cierre-dia', this.logger, () => this.recordarCierreDia());
  }

  /** Expuesto para pruebas. */
  async recordarPlanesManana(ahora = new Date()): Promise<number> {
    if ([0, 6].includes(workClock(ahora).weekday)) return 0;
    if ([0, 6].includes(workClock(ahora).weekday)) return 0;
    const manana = mananaIso(workDateKey(ahora));
    const fechaCol = parseFechaIso(manana);
    const supervisores = await this.prisma.user.findMany({
      where: { isActive: true, roleKey: ROLES.DIR_OPERACIONES },
      select: { id: true, companyMemberships: { select: { companyId: true, isDefault: true } } },
    });
    let avisos = 0;
    for (const s of supervisores) {
      const companyId =
        s.companyMemberships.find((m) => m.isDefault)?.companyId ?? s.companyMemberships[0]?.companyId;
      if (!companyId) continue;
      const users = await this.usuariosEmpresa(companyId);
      const esperados = this.esperadosDelSupervisor(s.id, users);
      if (!esperados.length) continue;
      const planes = await this.prisma.planDiario.findMany({
        where: {
          companyId,
          supervisorId: s.id,
          fecha: fechaCol,
          autorId: { in: esperados.map((u) => u.id) },
        },
        select: { autorId: true },
      });
      const enviados = new Set(planes.map((p) => p.autorId));
      for (const u of esperados.filter((x) => !enviados.has(x.id))) {
        await this.avisar(u.id, {
          type: 'WORKFLOW_PENDING',
          title: 'Falta tu plan de mañana',
          message: `Antes de las 18:00 manda a tu supervisor qué hará tu gente el ${manana}.`,
          triggerUserId: s.id,
          relatedEntityId: Number(manana.replace(/-/g, '')),
          companyId,
          entityType: 'PlanDiario',
        });
        avisos += 1;
      }
    }
    return avisos;
  }

  /** Expuesto para pruebas. */
  async recordarCierreDia(ahora = new Date()): Promise<number> {
    if ([0, 6].includes(workClock(ahora).weekday)) return 0;
    if ([0, 6].includes(workClock(ahora).weekday)) return 0;
    const hoy = workDateKey(ahora);
    const fechaCol = parseFechaIso(hoy);
    const supervisores = await this.prisma.user.findMany({
      where: { isActive: true, roleKey: ROLES.DIR_OPERACIONES },
      select: {
        id: true,
        nombre: true,
        companyMemberships: { select: { companyId: true, isDefault: true } },
      },
    });
    let avisos = 0;
    for (const s of supervisores) {
      const companyId =
        s.companyMemberships.find((m) => m.isDefault)?.companyId ?? s.companyMemberships[0]?.companyId;
      if (!companyId) continue;
      const ya = await this.prisma.cierreDiario.findFirst({
        where: { companyId, supervisorId: s.id, fecha: fechaCol },
        select: { id: true },
      });
      if (ya) continue;
      await this.avisar(s.id, {
        type: 'WORKFLOW_PENDING',
        title: 'Falta el cierre del día',
        message: `Entrega a dirección el resumen del ${hoy}.`,
        triggerUserId: s.id,
        relatedEntityId: Number(hoy.replace(/-/g, '')),
        companyId,
        entityType: 'CierreDiario',
      });
      avisos += 1;
    }
    return avisos;
  }

  private async compararPlanVsReal(
    supervisorId: number,
    companyId: number,
    fechaIso: string,
    personas: Array<{ userId: number; actividades?: Array<{ id: number; bucket: string }> }>,
  ) {
    const fechaCol = parseFechaIso(fechaIso);
    const users = await this.usuariosEmpresa(companyId);
    const arbol = subarbolIds(supervisorId, users);
    const planes = await this.prisma.planDiario.findMany({
      where: { companyId, fecha: fechaCol, autorId: { in: [...arbol] } },
      select: { id: true, autorId: true, renglonesJson: true, estado: true },
    });
    const porActividad = new Map<string, string>();
    for (const p of personas) {
      for (const a of p.actividades ?? []) porActividad.set(`${p.userId}:${a.id}`, a.bucket);
    }
    let planificados = 0;
    let conActividad = 0;
    let cumplidos = 0;
    const detalle: Array<{
      planId: number;
      renglonId: string;
      personaNombre: string;
      actividad: string;
      actividadCreadaId: number | null;
      bucket: string | null;
    }> = [];
    for (const plan of planes) {
      for (const r of normalizarRenglones(plan.renglonesJson)) {
        planificados += 1;
        const actId = r.actividadCreadaId ?? null;
        const bucket = actId != null ? porActividad.get(`${r.personaId}:${actId}`) ?? null : null;
        if (actId) conActividad += 1;
        if (bucket === 'terminada') cumplidos += 1;
        detalle.push({
          planId: plan.id,
          renglonId: r.id,
          personaNombre: r.personaNombre || '',
          actividad: r.actividad || '',
          actividadCreadaId: actId,
          bucket,
        });
      }
    }
    return { planificados, conActividad, cumplidos, sinProgramar: Math.max(0, planificados - conActividad), detalle: detalle.slice(0, 200) };
  }

  private renglonesDePlan(plan: { renglonesJson?: unknown; texto?: string }): PlanRenglon[] {
    const rows = normalizarRenglones(plan.renglonesJson);
    if (rows.length) return rows;
    return renglonesDesdeTextoLibre(String(plan.texto ?? ''));
  }

  async programarRenglon(
    sesion: Sesion,
    companyId: number | null,
    planId: number,
    renglonId: string,
  ) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const resultado = await this.prisma.$transaction(async tx => {
      // Bloquea la fila y vuelve a leer: dos solicitudes no pueden crear la misma actividad.
      const bloqueado = await tx.planDiario.updateMany({
        where: { id: planId, companyId: tenantId, supervisorId: actor.id, estado: { not: 'DEVUELTO' } },
        data: { supervisorId: actor.id },
      });
      if (bloqueado.count !== 1) throw new ForbiddenException('No puedes programar este plan o fue devuelto.');
      const plan = await tx.planDiario.findFirst({ where: { id: planId, companyId: tenantId, supervisorId: actor.id } });
      if (!plan) throw new NotFoundException('No encontré ese plan.');
      const renglones = this.renglonesDePlan(plan);
      const idx = renglones.findIndex((r) => r.id === renglonId);
      if (idx < 0) throw new NotFoundException('No encontré ese renglón.');
      const r = renglones[idx];
      if (!r.actividad.trim()) throw new BadRequestException('El renglón no tiene actividad.');
      if (!r.personaId) throw new BadRequestException('Asigna una persona al renglón antes de programar.');
      if (r.actividadCreadaId) {
        return { actividadId: r.actividadCreadaId, renglon: r, yaExistia: true };
      }
      await this.validarReferenciasRenglones([r], plan.autorId, tenantId, tx);
      const fechaIso = plan.fecha.toISOString().slice(0, 10);
      const indicaciones = [
        r.como ? `Cómo/alcance: ${r.como}` : '',
        r.porque ? `Por qué/objetivo: ${r.porque}` : '',
        r.horarioEstimado ? `Horario estimado: ${r.horarioEstimado}` : '',
        r.clienteNombre ? `Cliente: ${r.clienteNombre}` : '',
        r.proyectoNombre ? `Proyecto: ${r.proyectoNombre}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const prioridad =
        r.prioridad === 'alta' ? 'ALTA' : r.prioridad === 'baja' ? 'BAJA' : 'MEDIA';
      const creada = await this.activities.create(
        {
          titulo: r.actividad.slice(0, 200),
          indicaciones: indicaciones || undefined,
          descripcion: r.porque || undefined,
          responsableId: r.personaId,
          creadoPorId: actor.id,
          clientId: r.clienteId ?? undefined,
          projectId: r.proyectoId ?? undefined,
          fechaInicio: `${fechaIso}T09:00:00-06:00`,
          periodoInicio: fechaIso,
          periodoFin: fechaIso,
          prioridad,
          estatus: 'Pendiente',
        } as any,
        tenantId,
        { sinAviso: true, tx },
      );
      renglones[idx] = { ...r, actividadCreadaId: creada.id };
      await tx.planDiario.update({
        where: { id: plan.id, companyId: tenantId },
        data: {
          renglonesJson: renglones,
          texto: textoResumenDeRenglones(renglones),
          estado: 'PROGRAMADO',
        },
      });
      return { actividadId: creada.id, renglon: renglones[idx], yaExistia: false, creada };
    }, { timeout: 30000 });
    if ('creada' in resultado && resultado.creada) {
      await this.activities.publicarActividadCreada(resultado.creada, tenantId).catch(e => this.logger.warn(`No se pudo avisar la actividad: ${String(e)}`));
    }
    return { actividadId: resultado.actividadId, renglon: resultado.renglon, yaExistia: resultado.yaExistia };
  }

  private async validarReferenciasRenglones(rows: PlanRenglon[], autorId: number, companyId: number, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const users = await this.usuariosEmpresa(companyId);
    const equipo = subarbolIds(autorId, users);
    equipo.add(autorId);
    for (const r of rows) {
      if (r.personaId && !equipo.has(r.personaId)) throw new BadRequestException('La persona del renglón debe estar activa en el equipo del autor y en esta empresa.');
      if (r.clienteId && !await db.serviceClient.findFirst({ where: { id: r.clienteId, companyId }, select: { id: true } })) throw new BadRequestException('El cliente no está disponible en esta empresa.');
      if (r.proyectoId) {
        const proyecto = await db.operationalProject.findFirst({ where: { id: r.proyectoId, companyId, deletedAt: null }, select: { clientId: true } });
        if (!proyecto || (r.clienteId && proyecto.clientId !== r.clienteId)) throw new BadRequestException('El proyecto debe pertenecer a este cliente y empresa.');
      }
      if (r.actividadId && !await db.activity.findFirst({ where: { id: r.actividadId, companyId, deletedAt: null }, select: { id: true } })) throw new BadRequestException('La actividad no está disponible en esta empresa.');
    }
  }

  async programarTodo(sesion: Sesion, companyId: number | null, planId: number) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const plan = await this.planDelSupervisor(planId, actor.id, tenantId);
    const renglones = this.renglonesDePlan(plan);
    const resultados: Array<{ renglonId: string; actividadId?: number; error?: string }> = [];
    for (const r of renglones) {
      if (!r.actividad || !r.personaId) {
        resultados.push({ renglonId: r.id, error: 'Falta persona o actividad' });
        continue;
      }
      try {
        const out = await this.programarRenglon(sesion, companyId, planId, r.id);
        resultados.push({ renglonId: r.id, actividadId: out.actividadId });
      } catch (e) {
        resultados.push({
          renglonId: r.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { resultados };
  }

  async equipoParaPlan(sesion: Sesion, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const actor = await this.resolveActor(sesion, tenantId);
    const users = await this.usuariosEmpresa(tenantId);
    const equipo = users
      .filter((u) => u.managerId === actor.id || u.id === actor.id)
      .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, puesto: u.puesto }));
    return { equipo };
  }

}
