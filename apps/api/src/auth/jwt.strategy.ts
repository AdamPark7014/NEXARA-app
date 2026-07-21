import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service.js';
import { isSuperAdminEmail } from '../common/platform-accounts.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    // Client portal tokens have no `sub`; skip the user lookup entirely
    if (payload.isClient) {
      if (!payload.clientId) {
        throw new UnauthorizedException('Token de cliente inválido');
      }
      return {
        id: null,
        roleId: null,
        departmentId: null,
        permissions: [],
        isSuperAdmin: false,
        clientId: payload.clientId,
        isClient: true,
        isBranchUser: false,
        portalKind: payload.portalKind || 'client',
      };
    }

    // Branch portal tokens have no `sub`; skip the user lookup entirely
    if (payload.isBranchUser) {
      if (!payload.branchId) {
        throw new UnauthorizedException('Token de sucursal inválido');
      }
      return {
        id: null,
        roleId: null,
        departmentId: null,
        permissions: [],
        isSuperAdmin: false,
        clientId: payload.clientId ?? null,
        isClient: false,
        isBranchUser: true,
        branchId: payload.branchId,
        portalKind: payload.portalKind || 'branch',
      };
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const isSuperAdmin = Boolean(payload.isSuperAdmin) || isSuperAdminEmail(user.email);
    const effectiveRoleKey = this.authService.resolveEffectiveRoleKey(user);
    const permissions = this.authService.resolveUserPermissions(user, isSuperAdmin);

    return {
      id: payload.sub,
      roleId: payload.roleId,
      departmentId: payload.departmentId ?? user.departmentId,
      permissions,
      isSuperAdmin,
      roleKey: effectiveRoleKey,
      orgRoleKey: user.role?.orgRoleKey ?? payload.orgRoleKey ?? null,
      clientId: payload.clientId,
      isClient: false,
    };
  }
}
