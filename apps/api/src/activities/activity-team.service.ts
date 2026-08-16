import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

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

  constructor(private readonly prisma: PrismaService) {}

  private async loadActivity(activityId: number, companyId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(companyId) },
      select: { id: true, companyId: true, responsableId: true, anNumber: true },
    });
    assertCompanyAccess(activity, companyId, 'Actividad');
    return activity!;
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
  async addMember(
    activityId: number,
    input: { userId: number; rol?: AssigneeRole; horasPlan?: number | null },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.loadActivity(activityId, tenantId);

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

    if (existing) {
      return this.prisma.activityAssignee.update({
        where: { id: existing.id },
        data: {
          retiradoAt: null,
          rol: input.rol ?? existing.rol,
          horasPlan: input.horasPlan ?? existing.horasPlan,
        },
        include: { user: { select: { id: true, nombre: true, email: true } } },
      });
    }

    return this.prisma.activityAssignee.create({
      data: {
        activityId,
        userId: input.userId,
        rol: input.rol ?? 'TECNICO',
        horasPlan: input.horasPlan ?? null,
        companyId: tenantId,
      },
      include: { user: { select: { id: true, nombre: true, email: true } } },
    });
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
   * Reasigna la actividad y deja constancia.
   *
   * Antes esto era un `UPDATE` que pisaba el responsable: se perdía quién la
   * tenía, quién la movió y por qué, y el SLA seguía midiéndose desde una
   * asignación que ya no correspondía a nadie.
   *
   * El responsable anterior **permanece en el equipo como APOYO** salvo que se
   * pida retirarlo: normalmente conserva contexto del trabajo ya hecho.
   */
  async reassign(
    activityId: number,
    input: { aUsuarioId: number; motivo?: string; retirarAnterior?: boolean },
    actorId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.loadActivity(activityId, tenantId);

    const destino = await this.prisma.user.findFirst({
      where: { id: input.aUsuarioId, isActive: true },
      select: { id: true },
    });
    if (!destino) throw new NotFoundException('El nuevo responsable no existe o está inactivo');

    const anterior = activity.responsableId;
    if (anterior === input.aUsuarioId) {
      throw new BadRequestException('Esa persona ya es el responsable de la actividad');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.activity.update({
        where: { id: activityId },
        data: { responsableId: input.aUsuarioId, fechaAsignacion: new Date() },
      });

      await tx.activityReassignment.create({
        data: {
          activityId,
          deUsuarioId: anterior ?? null,
          aUsuarioId: input.aUsuarioId,
          movidaPorId: actorId,
          motivo: input.motivo?.trim()?.slice(0, 400) || null,
          companyId: tenantId,
        },
      });

      // El nuevo responsable entra como líder del equipo.
      const yaEnEquipo = await tx.activityAssignee.findFirst({
        where: { activityId, userId: input.aUsuarioId },
      });
      if (yaEnEquipo) {
        await tx.activityAssignee.update({
          where: { id: yaEnEquipo.id },
          data: { rol: 'LEAD', retiradoAt: null },
        });
      } else {
        await tx.activityAssignee.create({
          data: { activityId, userId: input.aUsuarioId, rol: 'LEAD', companyId: tenantId },
        });
      }

      if (anterior) {
        if (input.retirarAnterior) {
          await tx.activityAssignee.updateMany({
            where: { activityId, userId: anterior, retiradoAt: null },
            data: { retiradoAt: new Date() },
          });
        } else {
          const previo = await tx.activityAssignee.findFirst({
            where: { activityId, userId: anterior },
          });
          if (previo) {
            await tx.activityAssignee.update({ where: { id: previo.id }, data: { rol: 'APOYO' } });
          } else {
            await tx.activityAssignee.create({
              data: { activityId, userId: anterior, rol: 'APOYO', companyId: tenantId },
            });
          }
        }
      }

      return { reassigned: true, de: anterior, a: input.aUsuarioId };
    });
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
}
