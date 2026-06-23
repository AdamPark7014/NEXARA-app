import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CvsController } from './cvs.controller.js';
import { CvsService } from './cvs.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CvsController],
  providers: [CvsService],
  exports: [CvsService],
})
export class CvsModule {}
