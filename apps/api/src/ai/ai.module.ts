import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AiTriageService } from './ai-triage.service.js';
import { RevisionActividadService } from './revision/revision-actividad.service.js';
import { AiController } from './ai.controller.js';
import { ClaudeService } from './claude/claude.service.js';
import { AsistenteActividadesService } from './asistente/asistente-actividades.service.js';
import { TranscriptorService } from './voz/transcriptor.service.js';
import { ComplejidadService } from './complejidad/complejidad.service.js';
import { EstandarService } from './estandar/estandar.service.js';
import { GuardiaIaService } from './claude/guardia-ia.service.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  providers: [AiTriageService, ClaudeService, AsistenteActividadesService, TranscriptorService, ComplejidadService, EstandarService, RevisionActividadService, GuardiaIaService],
  controllers: [AiController],
  exports: [AiTriageService, ClaudeService, TranscriptorService, ComplejidadService, EstandarService],
})
export class AiModule {}
