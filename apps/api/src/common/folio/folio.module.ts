import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { FolioService } from './folio.service.js';

/**
 * Global: once servicios distintos generan folios y ninguno debería tener su
 * propia copia del contador.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [FolioService],
  exports: [FolioService],
})
export class FolioModule {}
