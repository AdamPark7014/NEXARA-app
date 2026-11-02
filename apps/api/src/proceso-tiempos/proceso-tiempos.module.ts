import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcesoTiemposController } from './proceso-tiempos.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProcesoTiemposController],
})
export class ProcesoTiemposModule {}
