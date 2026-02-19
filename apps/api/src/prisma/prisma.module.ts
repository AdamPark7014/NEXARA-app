import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
