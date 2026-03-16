import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, roleId: true, departmentId: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    return {
      id: payload.sub,
      roleId: payload.roleId,
      departmentId: payload.departmentId,
      permissions: payload.permissions || [],
      isSuperAdmin: Boolean(payload.isSuperAdmin),
      clientId: payload.clientId,
      isClient: Boolean(payload.isClient),
    };
  }
}
