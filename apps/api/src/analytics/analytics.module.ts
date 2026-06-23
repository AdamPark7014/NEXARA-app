import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { PublicAnalyticsController } from './public-analytics.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController, PublicAnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
