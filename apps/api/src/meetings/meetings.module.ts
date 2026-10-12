import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingsController } from './meetings.controller.js';
import { AiModule } from '../ai/ai.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ActaIaService } from './acta-ia.service.js';
import { GrabacionService } from './grabacion.service.js';
import { GrabacionController } from './grabacion.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AiModule, ActivitiesModule],
  controllers: [MeetingsController, GrabacionController],
  providers: [MeetingsService, ActaIaService, GrabacionService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
