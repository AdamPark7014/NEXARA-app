import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SalesTargetsService } from './sales-targets.service.js';
import { SalesTargetsController } from './sales-targets.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [SalesTargetsService],
  controllers: [SalesTargetsController],
  exports: [SalesTargetsService],
})
export class SalesTargetsModule {}
