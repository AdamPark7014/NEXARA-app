import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ExportsService } from './exports.service.js';
import { ExportsController } from './exports.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ExportsService],
  controllers: [ExportsController],
})
export class ExportsModule {}
