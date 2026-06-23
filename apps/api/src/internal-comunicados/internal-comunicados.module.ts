import { Module } from '@nestjs/common';
import { InternalComunicadosController } from './internal-comunicados.controller.js';
import { InternalComunicadosService } from './internal-comunicados.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [InternalComunicadosController],
  providers: [InternalComunicadosService],
  exports: [InternalComunicadosService],
})
export class InternalComunicadosModule {}
