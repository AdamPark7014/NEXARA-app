import { Module, Global } from '@nestjs/common';
import { PacService } from './pac.service.js';
import { CsdService } from './csd.service.js';
import { SatService } from './sat.service.js';

@Global()
@Module({
  providers: [PacService, CsdService, SatService],
  exports: [PacService, CsdService, SatService],
})
export class PacModule {}
