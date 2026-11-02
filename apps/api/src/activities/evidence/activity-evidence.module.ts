import { Module } from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service.js';
import { ActivityEvidenceZipService } from './activity-evidence-zip.service.js';
import { ActivityEvidenceController } from './activity-evidence.controller';
import { ActivityEvidenceFieldsController } from './activity-evidence-fields.controller.js';
import { CoreModule } from '../../common/core.module';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ActivitiesModule } from '../activities.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { ActivityGeofenceModule } from '../geofence/activity-geofence.module.js';
import { ActivitySessionsModule } from '../sessions/activity-sessions.module.js';
import { EvidenciasEscaladasService } from './evidencias-escaladas.service.js';

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    ActivitiesModule,
    NotificationsModule,
    ActivityGeofenceModule,
    ActivitySessionsModule,
  ],
  controllers: [ActivityEvidenceController, ActivityEvidenceFieldsController],
  // Sin recordatorio diario de «evidencia por revisar» (Adam, 29-10): lo enviado ya está cumplido y
  // calificarlo tarde no es un atraso. El resumen «Tu día» ya dice cuántas esperan revisión.
  // Lo que sí sube, una vez al día y a los jefes: lo que lleva más de 24 h (`evidencias-escaladas.ts`).
  providers: [ActivityEvidenceService, ActivityEvidenceFieldsService, ActivityEvidenceZipService, EvidenciasEscaladasService],
  exports: [ActivityEvidenceService, ActivityEvidenceFieldsService],
})
export class ActivityEvidenceModule {}
