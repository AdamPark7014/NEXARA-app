import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module.js';
import { CostosController } from './costos.controller.js';
import { CostosLigaService } from './costos-liga.service.js';
import { CostosProyectoService } from './costos-proyecto.service.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { LibroCostosService } from './libro-costos.service.js';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [CostosController],
  providers: [CostosTarifasService, LibroCostosService, CostosLigaService, CostosProyectoService],
  exports: [LibroCostosService],
})
export class CostosModule {}
