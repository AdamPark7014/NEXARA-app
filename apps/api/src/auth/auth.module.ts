import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller.js';
import { OidcService } from './oidc.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';

const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

@Module({
  imports: [
    PrismaModule,
    WebhooksModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '4h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OidcService],
  exports: [AuthService, JwtModule, OidcService],
})
export class AuthModule {}
