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

    let resolvedLogoUrl = client.logoUrl || null;
    if (!resolvedLogoUrl) {
      const branchWithLogo = await this.prisma['serviceClientBranch'].findFirst({
        where: {
          clientId: client.id,
          logoUrl: { not: null },
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
        select: { logoUrl: true },
      });
      resolvedLogoUrl = branchWithLogo?.logoUrl || null;
    }

    return {
      access_token: this.jwtService.sign(payload),
      client: {
        id: client.id,
        name: client.name,
        logoUrl: resolvedLogoUrl,
      },
    };
  }
}
