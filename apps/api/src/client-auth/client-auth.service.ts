import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const client = await this.prisma['serviceClient'].findFirst({
      where: { portalEmail: email.toLowerCase(), isActive: true },
    });
    if (!client || !client.portalPasswordHash) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const isValid = await bcrypt.compare(password, client.portalPasswordHash);
    if (!isValid) throw new UnauthorizedException('Credenciales invalidas');

    const payload = {
      clientId: client.id,
      isClient: true,
    };

    return {
      access_token: this.jwtService.sign(payload),
      client: {
        id: client.id,
        name: client.name,
        logoUrl: client.logoUrl,
      },
    };
  }
}
