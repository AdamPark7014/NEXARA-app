import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import axios from 'axios';

type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
};

/**
 * OIDC genérico (Azure AD / Google / Okta) vía discovery + code flow.
 * Emite identidad; AuthService convierte a JWT/sesión NEXARA.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discoveryCache: { at: number; data: any } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  isConfigured() {
    try {
      this.getConfig();
      return true;
    } catch {
      return false;
    }
  }

  status() {
    return {
      enabled: this.isConfigured(),
      provider: process.env.OIDC_PROVIDER_NAME || 'oidc',
      issuer: process.env.OIDC_ISSUER || null,
    };
  }

  async buildAuthorizeUrl(state?: string) {
    const cfg = this.getConfig();
    const disco = await this.discover(cfg.issuer);
    const authEndpoint = disco.authorization_endpoint;
    if (!authEndpoint) throw new ServiceUnavailableException('OIDC sin authorization_endpoint');
    const st = state || randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      scope: cfg.scopes,
      state: st,
    });
    return { url: `${authEndpoint}?${params.toString()}`, state: st };
  }

  async exchangeCode(code: string) {
    const cfg = this.getConfig();
    const disco = await this.discover(cfg.issuer);
    if (!disco.token_endpoint || !disco.userinfo_endpoint) {
      throw new ServiceUnavailableException('OIDC discovery incompleto');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });

    const tokenRes = await axios.post(disco.token_endpoint, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (tokenRes.status >= 400 || !tokenRes.data?.access_token) {
      this.logger.warn(`OIDC token error: ${tokenRes.status} ${JSON.stringify(tokenRes.data)}`);
      throw new UnauthorizedException('No se pudo validar el código SSO');
    }

    const userInfoRes = await axios.get(disco.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (userInfoRes.status >= 400) {
      throw new UnauthorizedException('No se pudo obtener el perfil SSO');
    }

    const info = userInfoRes.data || {};
    const email = String(info.email || info.preferred_username || '')
      .trim()
      .toLowerCase();
    const subject = String(info.sub || '').trim();
    if (!email || !subject) {
      throw new UnauthorizedException('El IdP no devolvió email/sub');
    }

    const provider = process.env.OIDC_PROVIDER_NAME || 'oidc';
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { oidcProvider: provider, oidcSubject: subject },
          { email },
        ],
      },
      include: { role: true, department: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Usuario no provisionado en NEXARA. Pide a un admin crear la cuenta o habilitar JIT.',
      );
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (!user.oidcSubject) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { oidcProvider: provider, oidcSubject: subject },
        include: { role: true, department: true },
      });
    }

    return user;
  }

  private getConfig(): OidcConfig {
    const issuer = process.env.OIDC_ISSUER?.trim();
    const clientId = process.env.OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
    const redirectUri =
      process.env.OIDC_REDIRECT_URI?.trim() ||
      `${process.env.API_PUBLIC_URL || 'http://localhost:3001'}/auth/oidc/callback`;
    if (!issuer || !clientId || !clientSecret) {
      throw new BadRequestException(
        'SSO no configurado (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET)',
      );
    }
    return {
      issuer: issuer.replace(/\/$/, ''),
      clientId,
      clientSecret,
      redirectUri,
      scopes: process.env.OIDC_SCOPES || 'openid profile email',
    };
  }

  private async discover(issuer: string) {
    const now = Date.now();
    if (this.discoveryCache && now - this.discoveryCache.at < 3600_000) {
      return this.discoveryCache.data;
    }
    const url = `${issuer}/.well-known/openid-configuration`;
    const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    if (res.status >= 400) {
      throw new ServiceUnavailableException(`OIDC discovery falló (${res.status})`);
    }
    this.discoveryCache = { at: now, data: res.data };
    return res.data;
  }

  /** Placeholder SCIM ping — documenta superficie enterprise. */
  scimStatus() {
    return {
      enabled: process.env.SCIM_ENABLED === 'true',
      endpoint: '/scim/v2',
      note: 'SCIM provisioning se habilita con SCIM_ENABLED=true (skeleton Iter 9)',
    };
  }
}
