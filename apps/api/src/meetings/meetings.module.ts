import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MeetingsService } from './meetings.service.js';
import { MeetingsController } from './meetings.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
