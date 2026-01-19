import { Module } from '@nestjs/common';
import { ViaticosService } from './viaticos.service.js';
import { ViaticosController } from './viaticos.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ViaticosController],
  providers: [ViaticosService],
  exports: [ViaticosService],
})
export class ViaticosModule {}
