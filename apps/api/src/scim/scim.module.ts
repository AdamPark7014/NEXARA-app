import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CompanyModule } from '../company/company.module.js';
import { ScimController, ScimBearerGuard } from './scim.controller.js';

@Module({
  imports: [PrismaModule, CompanyModule],
  controllers: [ScimController],
  providers: [ScimBearerGuard],
})
export class ScimModule {}
