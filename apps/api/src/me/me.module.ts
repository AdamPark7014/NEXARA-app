import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { TeamBoardService } from './team-board.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MeController],
  providers: [MeService, TeamBoardService],
})
export class MeModule {}
