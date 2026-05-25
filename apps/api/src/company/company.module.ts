import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CompanyService } from './company.service.js';
import { CompanyController, CompanyPublicController } from './company.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CompanyService],
  controllers: [CompanyController, CompanyPublicController],
  exports: [CompanyService],
})
export class CompanyModule {}
