import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AiTriageService } from './ai-triage.service.js';
import { AiController } from './ai.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [AiTriageService],
  controllers: [AiController],
  exports: [AiTriageService],
})
export class AiModule {}
