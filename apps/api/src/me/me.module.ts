import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ActivityEvidenceModule } from '../activities/evidence/activity-evidence.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MyActivitiesService } from './my-activities.service.js';
import { TeamBoardService } from './team-board.service.js';
import { KpisEquipoService } from './kpis-equipo.service.js';

@Module({
  imports: [AuthModule, PrismaModule, ActivitiesModule, ActivityEvidenceModule, NotificationsModule],
  controllers: [MeController],
  providers: [MeService, TeamBoardService, MyActivitiesService, KpisEquipoService],
})
export class MeModule {}
