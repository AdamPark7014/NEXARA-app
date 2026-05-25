import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarService } from './calendar.service.js';
import { CalendarController } from './calendar.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService],
})
export class CalendarModule {}
