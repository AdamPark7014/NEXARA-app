import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NomenclaturaAuditoriaService } from './nomenclatura-auditoria.service.js';
import { NomenclaturaController } from './nomenclatura.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [NomenclaturaController],
  providers: [NomenclaturaAuditoriaService],
  exports: [NomenclaturaAuditoriaService],
})
export class RrhhModule {}
