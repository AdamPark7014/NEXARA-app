import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ActivityEvidenceModule } from '../activities/evidence/activity-evidence.module.js';
import { ActivityToolsModule } from '../activities/tools/activity-tools.module.js';
import { ActivitySessionsModule } from '../activities/sessions/activity-sessions.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MyActivitiesService } from './my-activities.service.js';
import { TeamBoardService } from './team-board.service.js';
import { KpisEquipoService } from './kpis-equipo.service.js';
import { DireccionController } from './direccion.controller.js';
import { DireccionService } from './direccion.service.js';
import { PeerRequestsService } from './peer-requests.service.js';
import { QueSigueController } from './que-sigue.controller.js';
import { QueSigueService } from './que-sigue.service.js';
import { HorasExtraService } from './horas-extra.service.js';
import { TrayectosService } from '../activities/trayectos/trayectos.service.js';
import { ModulePolicyModule } from '../common/tenant/module-policy.module.js';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ActivitiesModule,
    ActivityEvidenceModule,
    ActivityToolsModule,
    ActivitySessionsModule,
    NotificationsModule,
    ModulePolicyModule,
  ],
  controllers: [MeController, DireccionController, QueSigueController],
  providers: [
    MeService,
    TeamBoardService,
    MyActivitiesService,
    KpisEquipoService,
    DireccionService,
    QueSigueService,
    // Por nombre: el aviso de «sin actividad» vive en `activities`, que no puede importar este módulo.
    { provide: 'QUE_SIGUE_AVISOS', useExisting: QueSigueService },
    PeerRequestsService,
    HorasExtraService,
    TrayectosService,
  ],
  // Nómina calcula las horas del periodo con el mismo módulo que ve el jefe en los
  // indicadores. Si fueran dos cálculos distintos, tarde o temprano darían distinto.
  exports: [KpisEquipoService],
})
export class MeModule {}
