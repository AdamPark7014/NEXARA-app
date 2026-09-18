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

@Module({
  imports: [PrismaModule, RealtimeModule, ActivitiesModule],
  controllers: [ProjectsController, OperationalProjectsController, ProyectosProfesionalController],
  providers: [ProjectsService, OperationalProjectsService, ProyectosProfesionalService, ProyectoProgramacionService],
})
export class ProjectsModule {}
