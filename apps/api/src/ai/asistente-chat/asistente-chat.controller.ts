import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { StaffOnlyGuard } from '../../common/security/staff-only.guard.js';
import { RbacGuard } from '../../common/rbac.guard.js';
import type { ActorLiga } from '../../chat/ligas/ligas.service.js';
import { AsistenteChatService } from './asistente-chat.service.js';

/**
 * Asistente de NEXARA en #general. Vive bajo `/api/chat/**` (abierto a todo el personal en la
 * matriz de URLs) con los mismos guardias que el chat; cada consulta aplica los permisos de quien
 * pregunta.
 */
@Controller('chat/asistente')
@UseGuards(AuthGuard('jwt'), StaffOnlyGuard, RbacGuard)
export class AsistenteChatController {
  constructor(private readonly asistente: AsistenteChatService) {}

  @Get('estado')
  estado(@CurrentUser() user: ActorLiga & { email?: string | null }) {
    return this.asistente.estado(user);
  }

  /** `texto`: el mensaje tal cual (con `@asistente`); `channelId`: #general. No publica nada en el canal. */
  @Post()
  responder(
    @CurrentUser() user: ActorLiga & { nombre?: string | null },
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { texto?: string; channelId?: number },
  ) {
    return this.asistente.responder(user, companyId, body ?? {});
  }
}
