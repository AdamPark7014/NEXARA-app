import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HrService } from './hr.service.js';
import { HrController } from './hr.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
