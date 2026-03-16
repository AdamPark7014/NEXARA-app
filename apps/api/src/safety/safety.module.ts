import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SafetyService } from './safety.service.js';
import { SafetyController } from './safety.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [SafetyService],
  controllers: [SafetyController],
  exports: [SafetyService],
})
export class SafetyModule {}
