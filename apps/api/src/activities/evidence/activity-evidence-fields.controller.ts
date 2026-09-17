import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service.js';

/**
 * Qué hay que documentar en una actividad: «Cámara 1», «Rack», «Canalización», y por
 * cada cosa en qué momentos se exige foto (antes / en progreso / después).
 *
 * Definirlos cambia lo que se le va a exigir a quien ejecuta, así que pide gestión de
 * actividades — el mismo permiso que asignar. Leerlos va con ver actividades: quien la
 * va a hacer tiene que poder ver sus huecos.
 */
@Controller('activities/:id/evidencia-campos')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ActivityEvidenceFieldsController {
  constructor(private readonly service: ActivityEvidenceFieldsService) {}

  @Get()
  @RBAC({
    anyPermissions: [
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
      PERMISSIONS.EVIDENCES_VIEW,
    ],
  })
  listar(
    @Param('id', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listarCampos(activityId, companyId);
  }

  /**
   * Reemplaza la lista completa. Un campo que ya existía conserva sus fotos (se empata
   * por id, y si no por nombre); el que desaparece de la lista se borra con las suyas.
   * Mandar `[]` deja la actividad sin campos: vuelve al flujo de N fotos libres.
   */
  @Put()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  definir(
    @Param('id', ParseIntPipe) activityId: number,
    @Body()
    body: {
      campos?: Array<{ id?: number; nombre?: string; momentos?: string[]; notas?: string }>;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.definirCampos(activityId, body?.campos ?? [], companyId);
  }
}
