import { Module } from '@nestjs/common';
import { LunchBreaksService } from './lunch-breaks.service.js';
import { LunchBreaksController } from './lunch-breaks.controller.js';
import { LunchBreaksCronService } from './lunch-breaks.cron.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [LunchBreaksService, LunchBreaksCronService],
  controllers: [LunchBreaksController],
  exports: [LunchBreaksService, LunchBreaksCronService],
})
export class LunchBreaksModule {}
