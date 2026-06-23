import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NocService } from './noc.service.js';
import { NocController } from './noc.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [NocService],
  controllers: [NocController],
  exports: [NocService],
})
export class NocModule {}
