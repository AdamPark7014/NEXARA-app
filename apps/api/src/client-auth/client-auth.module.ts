import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClientAuthController } from './client-auth.controller.js';
import { ClientAuthService } from './client-auth.service.js';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] || 'default_secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService],
  exports: [ClientAuthService],
})
export class ClientAuthModule {}
