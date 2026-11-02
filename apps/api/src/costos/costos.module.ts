import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module.js';
import { CostosController } from './costos.controller.js';
import { CostosLigaService } from './costos-liga.service.js';
import { CostosProyectoService } from './costos-proyecto.service.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { LibroCostosService } from './libro-costos.service.js';
import { CostosVehiculosController } from './vehiculos/costos-vehiculos.controller.js';
import { CostosVehiculosService } from './vehiculos/costos-vehiculos.service.js';
import { LecturaVehiculoService } from './vehiculos/lectura-vehiculo.service.js';
import { VehiculosMotorService } from './vehiculos/vehiculos-motor.service.js';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [CostosController, CostosVehiculosController],
  providers: [
    CostosTarifasService,
    LibroCostosService,
    CostosLigaService,
    CostosProyectoService,
    VehiculosMotorService,
    CostosVehiculosService,
    LecturaVehiculoService,
  ],
  exports: [LibroCostosService],
})
export class CostosModule {}
