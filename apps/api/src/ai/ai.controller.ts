import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AiTriageService } from './ai-triage.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { AsistenteActividadesService } from './asistente/asistente-actividades.service.js';
import { InterpretarInstruccionDto } from './asistente/dto/interpretar.dto.js';

@Controller('ai')
@UseGuards(RbacGuard)
export class AiController {
  constructor(
    private readonly triage: AiTriageService,
    private readonly asistente: AsistenteActividadesService,
  ) {}

  @Post('triage')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  triageTicket(
    @Body() body: { title: string; description?: string; clientName?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.triage.triageActivityText(body, companyId);
  }

  @Get('suggestions')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.BI_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  suggestions(@CurrentCompanyId() companyId: number | null) {
    return this.triage.suggestNextActions(companyId);
  }

  /** ¿Hay IA configurada en el servidor? (la web oculta el asistente si no). */
  @Get('asistente/estado')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS] })
  estadoAsistente() {
    return this.asistente.estado();
  }

  /**
   * Instrucción en lenguaje natural → propuestas de actividad. No crea nada: la web
   * muestra las propuestas y, al confirmar, cada una va a `POST /activities`, que aplica
   * los permisos de siempre.
   */
  @Post('asistente/interpretar')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS] })
  interpretar(
    @Body() body: InterpretarInstruccionDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.asistente.interpretar(body.texto, user, companyId);
  }
}
