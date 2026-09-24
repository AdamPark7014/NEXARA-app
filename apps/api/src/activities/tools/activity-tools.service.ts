import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../../common/tenant/tenant-scope.js';
import {
  MAX_LARGO_NOTA,
  estadoChecklist,
  mensajeChecklistPendiente,
  normalizarRequisitos,
  type EstadoChecklist,
  type RequisitoConCheck,
} from './herramientas-checklist.helpers.js';

export type ChecklistDeActividad = EstadoChecklist & {
  activityId: number;
  requisitos: RequisitoConCheck[];
  usesPersonalKit: boolean;
};

/**
 * Checklist de herramientas de la OT.
 *
 * Quien asigna define qué hay que llevar; quien ejecuta palomea cada renglón antes de
 * iniciar. El palomeo es de la **actividad**, no de cada persona: si va una cuadrilla,
 * la escalera se revisa una vez y queda quién la revisó.
 */
@Injectable()
export class ActivityToolsService {
  constructor(private readonly prisma: PrismaService) {}

  private async cargarActividad(activityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      select: { id: true, companyId: true, estatus: true, titulo: true, anNumber: true, responsableId: true },
    });
    assertCompanyAccess(activity, tenantId, 'Actividad');
    return activity!;
  }

  /**
   * Reemplaza la lista completa. Un renglón que sigue conserva su palomeo (se empata por
   * id, y si no por descripción); el que desaparece se borra con el suyo. Mandar `[]`
   * deja la OT sin checklist y por tanto sin candado al iniciar.
   */
  async definirRequisitos(
    activityId: number,
    entrada:
      | unknown
      | {
          requisitos?: unknown;
          /** Usuarios cuyas asignaciones de kit son válidas (responsable + equipo). */
          allowedKitUserIds?: number[];
          /** Flag: el responsable lleva su kit personal. */
          usePersonalKit?: boolean;
        },
    companyId?: number | null,
  ) {
    const activity = await this.cargarActividad(activityId, companyId);
    const payload = (entrada as any) ?? {};
    const requisitos = normalizarRequisitos(payload?.requisitos ?? entrada);

    // Validaciones: toolId debe existir y ser accesible desde KIT (usuario permitido) o INVENTORY (disponible).
    const allowedUsers = new Set<number>([
      Number(((activity as unknown) as { responsableId?: number | null }).responsableId ?? 0),
      ...((Array.isArray(payload?.allowedKitUserIds) ? payload.allowedKitUserIds : []) as number[]).map((n) =>
        Number(n),
      ),
    ].filter((n) => Number.isFinite(n) && n > 0));

    for (const req of requisitos) {
      if (req.toolId && Number(req.toolId) > 0) {
        const item = await (this.prisma as any).toolInventoryItem.findFirst({
          where: { id: req.toolId, ...companyWhere(activity.companyId) },
          select: { id: true, status: true },
        });
        if (!item) throw new BadRequestException('La herramienta seleccionada no existe en inventario');
        const status = String(item.status || '').toUpperCase();
        if (req.toolSource === 'INVENTORY' || !req.toolSource) {
          if (status !== 'AVAILABLE') {
            throw new BadRequestException('La herramienta seleccionada no está disponible en almacén');
          }
        } else if (req.toolSource === 'KIT') {
          // Debe estar asignada activamente al responsable o a alguien del equipo permitido.
          if (allowedUsers.size === 0) {
            throw new BadRequestException(
              'No se pudo validar el kit: falta el responsable o el equipo en la solicitud',
            );
          }
          const asignacion = await (this.prisma as any).toolKitAssignment.findFirst({
            where: {
              inventoryItemId: req.toolId,
              isActive: true,
              userId: { in: [...allowedUsers] },
              ...companyWhere(activity.companyId),
            },
            select: { id: true },
          });
          if (!asignacion) {
            throw new BadRequestException(
              'La herramienta seleccionada no pertenece al kit del responsable o su equipo',
            );
          }
        }
      }
    }

    const existentes = await this.prisma.activityToolRequirement.findMany({
      where: { activityId, ...companyWhere(activity.companyId) },
      select: { id: true, descripcion: true },
    });
    const porId = new Map(existentes.map((r) => [r.id, r]));
    const porDescripcion = new Map(
      existentes.map((r) => [r.descripcion.trim().toLowerCase(), r]),
    );
    const conservados = new Set<number>();

    await this.prisma.$transaction(async (tx) => {
      // Flag de kit personal en la actividad
      if (typeof payload?.usePersonalKit === 'boolean') {
        await tx.activity.update({
          where: { id: activityId },
          data: { usesPersonalKit: Boolean(payload.usePersonalKit) },
        });
      }
      for (const req of requisitos) {
        const previo =
          (req.id != null ? porId.get(req.id) : undefined) ??
          porDescripcion.get(req.descripcion.trim().toLowerCase());

        const data = {
          descripcion: req.descripcion,
          cantidad: new Prisma.Decimal(req.cantidad),
          productId: req.productId,
          toolId: req.toolId,
          toolSource: (req.toolSource as any) ?? null,
        };

        if (previo) {
          conservados.add(previo.id);
          await tx.activityToolRequirement.update({ where: { id: previo.id }, data });
        } else {
          const creado = await tx.activityToolRequirement.create({
            data: { ...data, activityId, companyId: activity.companyId },
            select: { id: true },
          });
          conservados.add(creado.id);
        }
      }

      const sobran = existentes.filter((r) => !conservados.has(r.id)).map((r) => r.id);
      if (sobran.length) {
        await tx.activityToolRequirement.deleteMany({ where: { id: { in: sobran } } });
      }
    });

    return this.listar(activityId, companyId);
  }

  /** El checklist con su avance. */
  async listar(activityId: number, companyId?: number | null): Promise<ChecklistDeActividad> {
    const activity = await this.cargarActividad(activityId, companyId);
    return this.listarDeActividad(activityId, activity.companyId);
  }

  /**
   * Igual que `listar` pero sin volver a cargar la actividad: lo usan el candado de
   * iniciar y el detalle, que ya la validaron.
   */
  async listarDeActividad(activityId: number, companyId: number): Promise<ChecklistDeActividad> {
    const [activity, filas] = await Promise.all([
      this.prisma.activity.findFirst({
        where: { id: activityId, ...companyWhere(companyId) },
        select: { usesPersonalKit: true },
      }),
      this.prisma.activityToolRequirement.findMany({
      where: { activityId, ...companyWhere(companyId) },
      orderBy: { id: 'asc' },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        tool: { select: { id: true, toolName: true, serialNumber: true } },
        // El último palomeo manda: revisar otra vez corrige lo que se marcó antes.
        checks: {
          orderBy: { at: 'desc' },
          take: 1,
          include: { user: { select: { id: true, nombre: true } } },
        },
        },
      }),
    ]);

    const requisitos: RequisitoConCheck[] = filas.map((fila) => {
      const check = fila.checks[0];
      return {
        id: fila.id,
        descripcion: fila.descripcion,
        cantidad: Number(fila.cantidad),
        productId: fila.productId,
        producto: fila.product
          ? { id: fila.product.id, sku: fila.product.sku, nombre: fila.product.name }
          : null,
        toolId: fila.toolId,
        herramienta: fila.tool
          ? { id: fila.tool.id, nombre: fila.tool.toolName, serie: fila.tool.serialNumber }
          : null,
        check: check
          ? {
              ok: check.ok,
              nota: check.nota,
              fotoUrl: check.fotoUrl,
              at: check.at.toISOString(),
              por: check.user ? { id: check.user.id, nombre: check.user.nombre } : null,
            }
          : null,
      };
    });

    return { activityId, requisitos, usesPersonalKit: Boolean(activity?.usesPersonalKit), ...estadoChecklist(requisitos) };
  }

  /**
   * El checklist visto desde la app del técnico (`me/activities/:id/herramientas`).
   * Solo si la OT es suya: esa superficie no pasa por RBAC, la dueñez es el permiso.
   */
  async listarParaAsignado(activityId: number, userId: number, companyId?: number | null) {
    const activity = await this.cargarActividad(activityId, companyId);
    await this.asertarAsignado(activityId, userId, activity.companyId);
    return this.listarDeActividad(activityId, activity.companyId);
  }

  /**
   * Palomea un renglón. Solo puede quien está asignado a la OT (o quien la gestiona):
   * el checklist es la declaración de quien va a trabajar, no un trámite de oficina.
   */
  async palomear(params: {
    activityId: number;
    requirementId: number;
    userId: number;
    ok: unknown;
    nota?: unknown;
    fotoUrl?: unknown;
    companyId?: number | null;
    /** `true` salta la verificación de asignación (supervisor con ACTIVITIES_MANAGE). */
    puedeGestionar?: boolean;
  }): Promise<ChecklistDeActividad> {
    const activity = await this.cargarActividad(params.activityId, params.companyId);

    if (!params.puedeGestionar) {
      await this.asertarAsignado(params.activityId, params.userId, activity.companyId);
    }

    const requisito = await this.prisma.activityToolRequirement.findFirst({
      where: {
        id: params.requirementId,
        activityId: params.activityId,
        ...companyWhere(activity.companyId),
      },
      select: { id: true },
    });
    if (!requisito) throw new NotFoundException('Ese renglón no está en el checklist de esta OT');

    const fotoUrl = String(params.fotoUrl ?? '').trim();
    if (fotoUrl && (fotoUrl.startsWith('data:') || fotoUrl.includes(';base64,') || fotoUrl.length > 500)) {
      throw new BadRequestException('La foto no se subió correctamente. Vuelve a tomarla.');
    }

    await this.prisma.activityToolCheck.create({
      data: {
        requirementId: requisito.id,
        userId: params.userId,
        ok: params.ok === true || params.ok === 'true' || params.ok === 1,
        nota: String(params.nota ?? '').trim().slice(0, MAX_LARGO_NOTA) || null,
        fotoUrl: fotoUrl || null,
        companyId: activity.companyId,
      },
    });

    return this.listarDeActividad(params.activityId, activity.companyId);
  }

  /**
   * Candado de `POST me/activities/:id/iniciar`: mientras falte palomear algo, no
   * arranca. Una OT sin checklist no exige nada — el candado solo existe donde alguien
   * se molestó en decir qué hay que llevar.
   *
   * Recibe el `companyId` de la sesión, y si no viene lo saca de la actividad: el
   * checklist es de la OT y no debe depender de que el header llegue.
   */
  async asertarChecklistCompleto(activityId: number, companyId?: number | null) {
    let tenantId = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;
    if (tenantId == null) {
      const activity = await this.prisma.activity.findFirst({
        where: { id: activityId },
        select: { companyId: true },
      });
      if (activity?.companyId == null) return;
      tenantId = activity.companyId;
    }

    const checklist = await this.listarDeActividad(activityId, tenantId);
    if (checklist.total === 0 || checklist.completo) return checklist;
    throw new BadRequestException(mensajeChecklistPendiente(checklist.pendientes));
  }

  /** Su fila de equipo en la OT; si no la tiene, no palomea. */
  private async asertarAsignado(activityId: number, userId: number, companyId: number) {
    const fila = await this.prisma.activityAssignee.findFirst({
      where: { activityId, userId, retiradoAt: null, ...companyWhere(companyId) },
      select: { id: true },
    });
    if (!fila) {
      throw new ForbiddenException('Esta actividad no está asignada a ti');
    }
  }
}
