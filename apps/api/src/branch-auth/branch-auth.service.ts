import { Injectable } from '@nestjs/common';
import { PortalAuthService, type PortalLoginMeta } from '../portal-auth/portal-auth.service.js';

/** @deprecated Prefer POST /portal/login — se mantiene como alias forzado a sucursal. */
@Injectable()
export class BranchAuthService {
  constructor(private readonly portalAuth: PortalAuthService) {}

  async login(email: string, password: string, meta?: PortalLoginMeta) {
    return this.portalAuth.loginAsBranch(email, password, meta);
  }
}
