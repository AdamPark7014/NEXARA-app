import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BranchAuthController } from './branch-auth.controller.js';
import { BranchAuthService } from './branch-auth.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BranchAuthController],
  providers: [BranchAuthService],
})
export class BranchAuthModule {}
