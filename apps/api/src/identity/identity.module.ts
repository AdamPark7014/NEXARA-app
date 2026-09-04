import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IdentityLinkService } from './identity-link.service';

@Module({
  imports: [PrismaModule],
  providers: [IdentityLinkService],
  exports: [IdentityLinkService],
})
export class IdentityModule {}
