import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HrService } from './hr.service.js';
import { HrController } from './hr.controller.js';
import { IncidenciasPersonalService } from './incidencias/incidencias-personal.service.js';
import { IncidenciasPersonalController } from './incidencias/incidencias-personal.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [HrService, IncidenciasPersonalService],
  controllers: [HrController, IncidenciasPersonalController],
  exports: [HrService, IncidenciasPersonalService],
})
export class HrModule {}
