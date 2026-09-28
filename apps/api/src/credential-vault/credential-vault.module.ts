import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CredentialVaultService } from './credential-vault.service.js';

@Module({
  imports: [PrismaModule],
  providers: [CredentialVaultService],
  exports: [CredentialVaultService],
})
export class CredentialVaultModule {}
