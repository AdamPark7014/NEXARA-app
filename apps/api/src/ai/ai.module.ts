import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiTriageService } from './ai-triage.service.js';
import { AiController } from './ai.controller.js';
import { ClaudeService } from './claude/claude.service.js';
import { AsistenteActividadesService } from './asistente/asistente-actividades.service.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  providers: [AiTriageService, ClaudeService, AsistenteActividadesService],
  controllers: [AiController],
  exports: [AiTriageService, ClaudeService],
})
export class AiModule {}
