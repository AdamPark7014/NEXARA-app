import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AprobacionesModule } from '../common/aprobaciones/aprobaciones.module.js';
import { HrService } from './hr.service.js';
import { HrController } from './hr.controller.js';
import { IncidenciasPersonalService } from './incidencias/incidencias-personal.service.js';
import { IncidenciasPersonalController } from './incidencias/incidencias-personal.controller.js';
import { ExpedienteService } from './expediente/expediente.service.js';
import { ExpedienteController } from './expediente/expediente.controller.js';
import { PersonalImportService } from './personal-import/personal-import.service.js';
import { PersonalImportController } from './personal-import/personal-import.controller.js';
import { RhAlertasService } from './alertas/rh-alertas.service.js';
import { RhSolicitudesService } from './rh-solicitudes.service.js';
import { RhSolicitudesController } from './rh-solicitudes.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AprobacionesModule],
  providers: [
    HrService,
    IncidenciasPersonalService,
    ExpedienteService,
    PersonalImportService,
    RhAlertasService,
    RhSolicitudesService,
  ],
  controllers: [
    HrController,
    IncidenciasPersonalController,
    ExpedienteController,
    PersonalImportController,
    RhSolicitudesController,
  ],
  exports: [HrService, IncidenciasPersonalService, ExpedienteService],
})
export class HrModule {}
