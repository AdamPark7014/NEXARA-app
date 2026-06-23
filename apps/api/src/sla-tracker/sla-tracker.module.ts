import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SlaTrackerService } from './sla-tracker.service.js';
import { SlaTrackerController } from './sla-tracker.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [SlaTrackerService],
  controllers: [SlaTrackerController],
})
export class SlaTrackerModule {}
