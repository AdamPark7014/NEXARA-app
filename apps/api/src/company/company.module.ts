import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CompanyService } from './company.service.js';
import { CompanyController, CompanyPublicController } from './company.controller.js';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    CompanyService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
  controllers: [CompanyController, CompanyPublicController],
  exports: [CompanyService],
})
export class CompanyModule {}
