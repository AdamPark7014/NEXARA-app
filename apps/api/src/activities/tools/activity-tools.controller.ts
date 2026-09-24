import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { ActivityToolsService } from './activity-tools.service.js';

/**
 * Checklist de herramientas de una OT: qué hay que llevar y quién palomeó qué.
 *
 * Definirlo cambia lo que se le va a exigir a quien ejecuta, así que pide gestión de
 * actividades — el mismo permiso que asignar. Verlo y palomearlo va con ver
 * actividades: quien la va a hacer tiene que poder abrir la lista y marcarla.
 */
@Controller('activities/:id/herramientas')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityToolsController {
  constructor(private readonly service: ActivityToolsService) {}

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  listar(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listar(activityId, companyId);
  }

  /**
   * Reemplaza la lista completa. Un renglón que sigue conserva su palomeo; el que
   * desaparece se borra. `[]` deja la OT sin checklist y sin candado al iniciar.
   */
  @Put()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  definir(
    @Param('id', ParseIntPipe) activityId: number,
    @Body()
    body: {
      requisitos?: Array<{
        id?: number;
        descripcion?: string;
        cantidad?: number;
        productId?: number;
        toolId?: number;
        toolSource?: 'KIT' | 'INVENTORY';
      }>;
      /** Usuarios cuyas asignaciones de kit cuentan para validar selección de herramientas. */
      allowedKitUserIds?: number[];
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.definirRequisitos(
      activityId,
      {
        requisitos: body?.requisitos ?? [],
        allowedKitUserIds: Array.isArray(body?.allowedKitUserIds)
          ? (body!.allowedKitUserIds as number[]).filter((n) => Number.isFinite(n) && Number(n) > 0).map((n) => Number(n))
          : [],
      },
      companyId,
    );
  }

  /** «Lo traigo y sirve» / «falta o está dañado», con nota y foto opcionales. */
  @Post(':requirementId/check')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.ACTIVITIES_MANAGE] })
  palomear(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) activityId: number,
    @Param('requirementId', ParseIntPipe) requirementId: number,
    @Body() body: { ok?: boolean; nota?: string; fotoUrl?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.palomear({
      activityId,
      requirementId,
      userId: user.id,
      ok: body?.ok,
      nota: body?.nota,
      fotoUrl: body?.fotoUrl,
      companyId,
      puedeGestionar: Boolean(user.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE)),
    });
  }
}
