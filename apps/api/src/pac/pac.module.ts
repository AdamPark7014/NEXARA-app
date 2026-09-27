import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PacService } from './pac.service.js';
import { CsdService } from './csd.service.js';
import { SatService } from './sat.service.js';
import { PacReadinessService } from './pac-readiness.service.js';
import { PacController } from './pac.controller.js';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PacController],
  providers: [PacService, CsdService, SatService, PacReadinessService],
  exports: [PacService, CsdService, SatService, PacReadinessService],
})
export class PacModule {}
