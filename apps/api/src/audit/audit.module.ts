import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { MutationAuditInterceptor } from './mutation-audit.interceptor.js';

@Module({
  imports: [PrismaModule],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MutationAuditInterceptor,
    },
  ],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
