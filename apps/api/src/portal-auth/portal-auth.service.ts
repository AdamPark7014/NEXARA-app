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

/** Optional company scoping for multi-tenant portal login. */
export type PortalCompanyHint = {
  companyId?: number | null;
  companySlug?: string | null;
};

/**
 * Login unificado del portal NEXARA (tickets).
 * portalEmail is unique per companyId. Without a company hint, login is allowed
 * only when the email matches a single company; otherwise companySlug/companyId is required.
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

  /**
   * Resuelve companyId desde slug y/o id. Devuelve null si no hay hint.
   * Si hay hint inválido (empresa inexistente/inactiva o slug≠id), falla el login.
   */
  private async resolveScopedCompanyId(hint?: PortalCompanyHint): Promise<number | null> {
    if (!hint) return null;
    const slug = hint.companySlug?.trim().toLowerCase() || '';
    const rawId = hint.companyId != null ? Number(hint.companyId) : NaN;
    const hasId = Number.isFinite(rawId) && rawId > 0;
    if (!slug && !hasId) return null;

    if (hasId) {
      const byId = await this.prisma.companyProfile.findFirst({
        where: { id: rawId, isActive: true },
        select: { id: true, slug: true },
      });
      if (!byId) throw new UnauthorizedException('Credenciales invalidas');
      if (slug && byId.slug?.toLowerCase() !== slug) {
        throw new UnauthorizedException('Credenciales invalidas');
      }
      return byId.id;
    }

    const bySlug = await this.prisma.companyProfile.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!bySlug) throw new UnauthorizedException('Credenciales invalidas');
    return bySlug.id;
  }

  /**
   * Sin company hint: si el email existe en más de una empresa, exigir companySlug/companyId.
   */
  private async assertEmailNotAmbiguousAcrossTenants(email: string, meta?: PortalLoginMeta) {
    const [clients, branches] = await Promise.all([
      this.prisma.serviceClient.findMany({
        where: { portalEmail: email, isActive: true },
        select: { companyId: true },
      }),
      this.prisma.serviceClientBranch.findMany({
        where: { portalEmail: email, isActive: true },
        select: { companyId: true },
      }),
    ]);
    const companyIds = new Set<number>([
      ...clients.map((c) => c.companyId),
      ...branches.map((b) => b.companyId),
    ]);
    if (companyIds.size > 1) {
      await this.auditLogin({
        success: false,
        entityId: 0,
        email,
        reason: 'company_hint_required',
        meta,
      });
      throw new UnauthorizedException(
        'Indica la empresa (companySlug o companyId) para iniciar sesión',
      );
    }
  }

  async loginAsClient(
    email: string,
    password: string,
    meta?: PortalLoginMeta,
    companyHint?: PortalCompanyHint,
  ) {
    const normalized = email.trim().toLowerCase();
    const scopedCompanyId = await this.resolveScopedCompanyId(companyHint);
    if (scopedCompanyId == null) {
      await this.assertEmailNotAmbiguousAcrossTenants(normalized, meta);
    }
    const client = await this.prisma.serviceClient.findFirst({
      where: {
        portalEmail: normalized,
        isActive: true,
        ...(scopedCompanyId != null ? { companyId: scopedCompanyId } : {}),
      },
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

    const companyId = client.companyId ?? null;
    const payload = {
      portalKind: 'client' as PortalKind,
      clientId: client.id,
      companyId,
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
      companyId,
      client: {
        id: client.id,
        name: client.name,
        logoUrl: resolvedLogoUrl,
        companyId,
      },
    };
  }

  async loginAsBranch(
    email: string,
    password: string,
    meta?: PortalLoginMeta,
    companyHint?: PortalCompanyHint,
  ) {
    const normalized = email.trim().toLowerCase();
    const scopedCompanyId = await this.resolveScopedCompanyId(companyHint);
    if (scopedCompanyId == null) {
      await this.assertEmailNotAmbiguousAcrossTenants(normalized, meta);
    }
    const branch = await this.prisma.serviceClientBranch.findFirst({
      where: {
        portalEmail: normalized,
        isActive: true,
        ...(scopedCompanyId != null ? { companyId: scopedCompanyId } : {}),
      },
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

    const companyId = branch.companyId ?? branch.client?.companyId ?? null;
    const payload = {
      portalKind: 'branch' as PortalKind,
      clientId: branch.clientId,
      branchId: branch.id,
      companyId,
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
      companyId,
      branch: {
        id: branch.id,
        name: branch.name,
        branchNumber: branch.branchNumber,
        clientId: branch.clientId,
        clientName: branch.client?.name || null,
        logoUrl: branch.logoUrl || branch.client?.logoUrl || null,
        companyId,
      },
    };
  }

  /** Client-first. Con company hint, ambos lookups incluyen companyId. */
  async login(
    email: string,
    password: string,
    meta?: PortalLoginMeta,
    companyHint?: PortalCompanyHint,
  ) {
    try {
      return await this.loginAsClient(email, password, meta, companyHint);
    } catch (firstErr) {
      // Ambiguity / company hint errors should not fall through to branch.
      if (
        firstErr instanceof UnauthorizedException &&
        String((firstErr as any).message || '').includes('empresa')
      ) {
        throw firstErr;
      }
      try {
        return await this.loginAsBranch(email, password, meta, companyHint);
      } catch {
        throw firstErr;
      }
    }
  }
}
