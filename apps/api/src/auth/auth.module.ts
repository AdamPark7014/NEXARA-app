import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '4h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
