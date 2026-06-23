import { Module } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { GpsController } from './gps.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GpsController],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}
