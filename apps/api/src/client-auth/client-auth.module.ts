import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClientAuthController } from './client-auth.controller.js';
import { ClientAuthService } from './client-auth.service.js';

const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '4h' },
    }),
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService],
  exports: [ClientAuthService],
})
export class ClientAuthModule {}
