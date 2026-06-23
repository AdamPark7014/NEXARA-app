import { Module, Global } from '@nestjs/common';
import { PacService } from './pac.service.js';

@Global()
@Module({
  providers: [PacService],
  exports: [PacService],
})
export class PacModule {}
