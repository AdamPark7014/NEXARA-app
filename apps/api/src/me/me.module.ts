import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MyActivitiesService } from './my-activities.service.js';
import { TeamBoardService } from './team-board.service.js';

@Module({
  imports: [AuthModule, PrismaModule, ActivitiesModule],
  controllers: [MeController],
  providers: [MeService, TeamBoardService, MyActivitiesService],
})
export class MeModule {}
