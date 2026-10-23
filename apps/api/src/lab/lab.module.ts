import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AiModule } from '../ai/ai.module.js';
import { LabService } from './lab.service.js';
import { LabController } from './lab.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, AiModule],
  providers: [LabService],
  controllers: [LabController],
  exports: [LabService],
})
export class LabModule {}
