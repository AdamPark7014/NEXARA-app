import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ActivityEvidenceModule } from '../activities/evidence/activity-evidence.module.js';
import { ActivityToolsModule } from '../activities/tools/activity-tools.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MyActivitiesService } from './my-activities.service.js';
import { TeamBoardService } from './team-board.service.js';
import { KpisEquipoService } from './kpis-equipo.service.js';
import { HorasExtraService } from './horas-extra.service.js';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ActivitiesModule,
    ActivityEvidenceModule,
    ActivityToolsModule,
    NotificationsModule,
  ],
  controllers: [MeController],
  providers: [MeService, TeamBoardService, MyActivitiesService, KpisEquipoService, HorasExtraService],
  // Nómina calcula las horas del periodo con el mismo módulo que ve el jefe en los
  // indicadores. Si fueran dos cálculos distintos, tarde o temprano darían distinto.
  exports: [KpisEquipoService],
})
export class MeModule {}
