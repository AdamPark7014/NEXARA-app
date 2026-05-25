import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ExecutiveService } from './executive.service.js';
import { ExecutiveController } from './executive.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ExecutiveService],
  controllers: [ExecutiveController],
})
export class ExecutiveModule {}
