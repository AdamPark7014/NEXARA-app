import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'default_secret',
    });
  }

  async validate(payload: any) {
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
