import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivityFeedService } from './activity-feed.service.js';
import { ActivityFeedController } from './activity-feed.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ActivityFeedService],
  controllers: [ActivityFeedController],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
