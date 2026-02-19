import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class BranchAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const branch = await this.prisma['serviceClientBranch'].findFirst({
      where: { portalEmail: email.toLowerCase(), isActive: true },
      include: { client: true },
    });
    if (!branch || !branch.portalPasswordHash) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const isValid = await bcrypt.compare(password, branch.portalPasswordHash);
    if (!isValid) throw new UnauthorizedException('Credenciales invalidas');

    const payload = {
      clientId: branch.clientId,
      branchId: branch.id,
      isBranchUser: true,
    };

    return {
      access_token: this.jwtService.sign(payload),
      branch: {
        id: branch.id,
        name: branch.name,
        branchNumber: branch.branchNumber,
        clientId: branch.clientId,
        clientName: branch.client?.name || null,
      },
    };
  }
}
