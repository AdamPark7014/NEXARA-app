import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ModulePolicyService } from './module-policy.service.js';

@Module({
  imports: [PrismaModule],
  providers: [ModulePolicyService],
  exports: [ModulePolicyService],
})
export class ModulePolicyModule {}
