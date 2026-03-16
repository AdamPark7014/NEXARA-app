import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CronService } from './cron.service.js';

@Module({
  imports: [PrismaModule],
  providers: [CronService],
})
export class CronModule {}
