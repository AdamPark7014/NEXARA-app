import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module.js';
import { SmartQuoteModule } from '../smart-quote/smart-quote.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CctvDisenosController } from './cctv-disenos.controller.js';
import { CctvDisenosService } from './cctv-disenos.service.js';
import { ExistenciasCctvService } from './existencias.service.js';
import { LecturaFichaService } from './lectura-ficha.service.js';

/** Diseñador de videovigilancia de Core (`/erp/videovigilancia`). */
@Module({
  imports: [PrismaModule, AiModule, CatalogModule, CotizacionesModule, SmartQuoteModule],
  controllers: [CctvDisenosController],
  providers: [CctvDisenosService, LecturaFichaService, ExistenciasCctvService],
  exports: [CctvDisenosService],
})
export class CctvDisenosModule {}
