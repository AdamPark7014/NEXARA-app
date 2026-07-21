import { Module } from '@nestjs/common';
import { PortalAuthModule } from '../portal-auth/portal-auth.module.js';
import { BranchAuthController } from './branch-auth.controller.js';
import { BranchAuthService } from './branch-auth.service.js';

@Module({
  imports: [PortalAuthModule],
  controllers: [BranchAuthController],
  providers: [BranchAuthService],
  exports: [BranchAuthService],
})
export class BranchAuthModule {}
