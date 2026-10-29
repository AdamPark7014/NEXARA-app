import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CctvDisenosController } from './cctv-disenos.controller.js';
import { CctvDisenosService } from './cctv-disenos.service.js';

/** Diseñador de videovigilancia de Core (`/erp/videovigilancia`). */
@Module({
  imports: [PrismaModule],
  controllers: [CctvDisenosController],
  providers: [CctvDisenosService],
  exports: [CctvDisenosService],
})
export class CctvDisenosModule {}
