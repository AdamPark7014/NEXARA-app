import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CompanyService } from './company.service.js';
import { CompanyController, CompanyPublicController } from './company.controller.js';
import { CompanyApiKeysService } from './company-api-keys.service.js';
import { CompanyApiKeysController } from './company-api-keys.controller.js';
import { BillingService } from './billing.service.js';
import { BillingController } from './billing.controller.js';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor.js';
import { ApiKeyAuthGuard } from '../common/tenant/api-key-auth.guard.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    CompanyService,
    CompanyApiKeysService,
    BillingService,
    ApiKeyAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
  controllers: [
    CompanyController,
    CompanyPublicController,
    CompanyApiKeysController,
    BillingController,
  ],
  exports: [CompanyService, CompanyApiKeysService, BillingService, ApiKeyAuthGuard],
})
export class CompanyModule {}
