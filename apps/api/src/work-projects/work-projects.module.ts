import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkProjectsController } from './work-projects.controller';
import { WorkProjectsService } from './work-projects.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkProjectsController],
  providers: [WorkProjectsService],
})
export class WorkProjectsModule {}
