import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export type PortalKind = 'client' | 'branch';

export type PortalLoginMeta = {
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Login unificado del portal NEXARA (tickets).
 * Resuelve ServiceClient o ServiceClientBranch con el mismo email/password.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  private async auditLogin(dto: {
    success: boolean;
    portalKind?: PortalKind;
    entityId: number;
    email: string;
    reason?: string;
    meta?: PortalLoginMeta;
  }) {
    try {
      await this.audit.log(
        {
          entityType: 'PortalAuth',
          entityId: dto.entityId || 0,
          action: dto.success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
          changes: {
            email: dto.email,
            portalKind: dto.portalKind ?? null,
            reason: dto.reason ?? null,
          },
          ipAddress: dto.meta?.ipAddress,
          userAgent: dto.meta?.userAgent,
        },
        undefined,
      );
    } catch {
      // No bloquear login por fallo de auditoría
    }
  }

  async loginAsClient(email: string, password: string, meta?: PortalLoginMeta) {
    const normalized = email.trim().toLowerCase();
    const client = await this.prisma.serviceClient.findFirst({
      where: { portalEmail: normalized, isActive: true },
    });
    if (!client?.portalPasswordHash) {
      await this.auditLogin({
        success: false,
        portalKind: 'client',
        entityId: 0,
        email: normalized,
        reason: 'client_not_found',
        meta,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }
    const isValid = await bcrypt.compare(password, client.portalPasswordHash);
    if (!isValid) {
      await this.auditLogin({
        success: false,
        portalKind: 'client',
        entityId: client.id,
        email: normalized,
        reason: 'bad_password',
        meta,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    let resolvedLogoUrl = client.logoUrl || null;
    if (!resolvedLogoUrl) {
      const branchWithLogo = await this.prisma.serviceClientBranch.findFirst({
        where: { clientId: client.id, logoUrl: { not: null }, isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { logoUrl: true },
      });
      resolvedLogoUrl = branchWithLogo?.logoUrl || null;
    }

    const payload = {
      portalKind: 'client' as PortalKind,
      clientId: client.id,
      isClient: true,
      isBranchUser: false,
    };

    await this.auditLogin({
      success: true,
      portalKind: 'client',
      entityId: client.id,
      email: normalized,
      meta,
    });

    return {
      access_token: this.jwtService.sign(payload),
      portalKind: 'client' as PortalKind,
      client: {
        id: client.id,
        name: client.name,
        logoUrl: resolvedLogoUrl,
      },
    };
  }

  async loginAsBranch(email: string, password: string, meta?: PortalLoginMeta) {
    const normalized = email.trim().toLowerCase();
    const branch = await this.prisma.serviceClientBranch.findFirst({
      where: { portalEmail: normalized, isActive: true },
      include: { client: true },
    });
    if (!branch?.portalPasswordHash) {
      await this.auditLogin({
        success: false,
        portalKind: 'branch',
        entityId: 0,
        email: normalized,
        reason: 'branch_not_found',
        meta,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }
    const isValid = await bcrypt.compare(password, branch.portalPasswordHash);
    if (!isValid) {
      await this.auditLogin({
        success: false,
        portalKind: 'branch',
        entityId: branch.id,
        email: normalized,
        reason: 'bad_password',
        meta,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload = {
      portalKind: 'branch' as PortalKind,
      clientId: branch.clientId,
      branchId: branch.id,
      isClient: false,
      isBranchUser: true,
    };

    await this.auditLogin({
      success: true,
      portalKind: 'branch',
      entityId: branch.id,
      email: normalized,
      meta,
    });

    return {
      access_token: this.jwtService.sign(payload),
      portalKind: 'branch' as PortalKind,
      branch: {
        id: branch.id,
        name: branch.name,
        branchNumber: branch.branchNumber,
        clientId: branch.clientId,
        clientName: branch.client?.name || null,
        logoUrl: branch.logoUrl || branch.client?.logoUrl || null,
      },
    };
  }

  /** Client-first (igual que PanelLogin mode=tickets). */
  async login(email: string, password: string, meta?: PortalLoginMeta) {
    try {
      return await this.loginAsClient(email, password, meta);
    } catch (firstErr) {
      try {
        return await this.loginAsBranch(email, password, meta);
      } catch {
        throw firstErr;
      }
    }
  }
}
