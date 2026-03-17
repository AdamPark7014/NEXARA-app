import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { OperationalProjectsController } from './operational-projects.controller';
import { OperationalProjectsService } from './operational-projects.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, RealtimeModule],
  controllers: [ProjectsController, OperationalProjectsController],
  providers: [ProjectsService, OperationalProjectsService],
})
export class ProjectsModule {}
