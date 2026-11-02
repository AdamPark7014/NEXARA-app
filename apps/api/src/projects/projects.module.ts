import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { OperationalProjectsController } from './operational-projects.controller';
import { OperationalProjectsService } from './operational-projects.service';
import { ProyectosProfesionalController } from './proyectos-profesional.controller';
import { ProyectosProfesionalService } from './proyectos-profesional.service';
import { ProyectoProgramacionService } from './proyecto-programacion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ActivitiesModule } from '../activities/activities.module';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { CotizacionGanadaController } from './cotizacion-ganada.controller';
import { CotizacionGanadaService } from './cotizacion-ganada.service';

@Module({
  imports: [PrismaModule, RealtimeModule, ActivitiesModule, CotizacionesModule],
  controllers: [ProjectsController, OperationalProjectsController, ProyectosProfesionalController, CotizacionGanadaController],
  providers: [ProjectsService, OperationalProjectsService, ProyectosProfesionalService, ProyectoProgramacionService, CotizacionGanadaService],
})
export class ProjectsModule {}
