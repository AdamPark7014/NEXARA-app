import { Module } from '@nestjs/common';
import { CoreModule } from '../common/core.module.js';
import { EmailModule } from '../common/email/email.module.js';
import { FolioModule } from '../common/folio/folio.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module';
import { IntegraModule } from './integra.module';

/**
 * Contexto mínimo para `scripts/import-acs-avatars.js`.
 *
 * NO es `AppModule` a propósito: arrancar la app entera en un segundo proceso
 * dentro del contenedor registraría otra vez todos los `@Cron`
 * (`ScheduleModule.forRoot()`), que no tienen candado entre procesos — correos,
 * cierres de jornada y sincronizaciones saldrían dobles mientras corre el
 * script. Aquí solo están los globales que necesita el grafo de Integra.
 */
@Module({
  imports: [
    CoreModule,
    ObservabilityModule,
    JobsModule,
    RealtimeModule,
    PrismaModule,
    EmailModule,
    FolioModule,
    IntegraModule,
  ],
})
export class AcsAvatarImportCliModule {}
