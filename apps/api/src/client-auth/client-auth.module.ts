import { Module } from '@nestjs/common';
import { PortalAuthModule } from '../portal-auth/portal-auth.module.js';
import { ClientAuthController } from './client-auth.controller.js';
import { ClientAuthService } from './client-auth.service.js';

@Module({
  imports: [PortalAuthModule],
  controllers: [ClientAuthController],
  providers: [ClientAuthService],
  exports: [ClientAuthService],
})
export class ClientAuthModule {}
