import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingsController } from './meetings.controller.js';
import { AiModule } from '../ai/ai.module.js';
import { ActaIaService } from './acta-ia.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AiModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, ActaIaService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
