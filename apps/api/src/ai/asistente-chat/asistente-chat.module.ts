import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../../users/users.module.js';
import { ChatModule } from '../../chat/chat.module.js';
import { AiModule } from '../ai.module.js';
import { AsistenteActividadesService } from '../asistente/asistente-actividades.service.js';
import { AsistenteChatController } from './asistente-chat.controller.js';
import { AsistenteChatService } from './asistente-chat.service.js';

/**
 * Módulo propio del asistente del chat: no toca `AiModule` (su `ClaudeService` exportado se comparte,
 * con el mismo tope diario) y provee aquí el asistente de actividades que reusa para «asígnale a…».
 */
@Module({
  imports: [PrismaModule, UsersModule, ChatModule, AiModule],
  controllers: [AsistenteChatController],
  providers: [AsistenteChatService, AsistenteActividadesService],
})
export class AsistenteChatModule {}
