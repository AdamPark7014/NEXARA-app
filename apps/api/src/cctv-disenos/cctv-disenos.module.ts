import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CctvDisenosController } from './cctv-disenos.controller.js';
import { CctvDisenosService } from './cctv-disenos.service.js';
import { LecturaFichaService } from './lectura-ficha.service.js';

/** Diseñador de videovigilancia de Core (`/erp/videovigilancia`). */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [CctvDisenosController],
  providers: [CctvDisenosService, LecturaFichaService],
  exports: [CctvDisenosService],
})
export class CctvDisenosModule {}
