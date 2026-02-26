import { Module } from '@nestjs/common';
import { LunchBreaksService } from './lunch-breaks.service.js';
import { LunchBreaksController } from './lunch-breaks.controller.js';
import { LunchBreaksCronService } from './lunch-breaks.cron.service.js';

@Module({
  providers: [LunchBreaksService, LunchBreaksCronService],
  controllers: [LunchBreaksController],
  exports: [LunchBreaksService, LunchBreaksCronService],
})
export class LunchBreaksModule {}
