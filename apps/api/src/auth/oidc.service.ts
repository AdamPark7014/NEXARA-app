import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import axios from 'axios';
import {
  aleatorio,
  claimsDeIdToken,
  dominioDe,
  esProveedorSso,
  firmarEstado,
  identidadConfiable,
  idTokenValido,
  nextSeguro,
  pkce,
  tenantDeIssuer,
  vueltaSegura,
  type EstadoSso,
  type MotivoSso,
  type ProveedorSso,
} from './sso-reglas.js';

type ConfigProveedor = {
  proveedor: ProveedorSso;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  /** Parámetros extra del authorize (p. ej. `prompt=select_account`). */
  extra: Record<string, string>;
};

/** Error de SSO con un motivo que el login sabe explicar en una frase. */
export class ErrorSso extends Error {
  constructor(readonly motivo: MotivoSso, mensaje?: string) {
    super(mensaje ?? motivo);
  }
}

const PRODUCCION = () => process.env.NODE_ENV === 'production';

/**
 * Entrar con Google, con Microsoft (cuentas de trabajo de Microsoft 365, incluidas las de GoDaddy)
 * o con el OIDC genérico de antes. Code flow con PKCE, `state` firmado en cookie y `nonce`.
 *
 * Solo entra quien ya tiene cuenta activa en NEXARA con ese mismo correo: no se crean usuarios.
 * Cada proveedor se activa con sus variables de entorno; sin ellas su botón no aparece.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly discovery = new Map<string, { at: number; data: any }>();
  private readonly tenants = new Map<string, { at: number; tenant: string | null }>();

  constructor(private readonly prisma: PrismaService) {}

  configDe(proveedor: ProveedorSso): ConfigProveedor | null {
    if (proveedor === 'google') {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) return null;
      return {
        proveedor,
        issuer: 'https://accounts.google.com',
        clientId,
        clientSecret,
        scopes: 'openid email profile',
        extra: { prompt: 'select_account' },
      };
    }
    if (proveedor === 'microsoft') {
      const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
      const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) return null;
      // `organizations`: cualquier cuenta de trabajo o escuela (no cuentas personales de Outlook).
      const tenant = process.env.MICROSOFT_OAUTH_TENANT?.trim() || 'organizations';
      return {
        proveedor,
        issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
        clientId,
        clientSecret,
        scopes: 'openid email profile',
        extra: { prompt: 'select_account' },
      };
    }
    const issuer = process.env.OIDC_ISSUER?.trim();
    const clientId = process.env.OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
    if (!issuer || !clientId || !clientSecret) return null;
    return {
      proveedor,
      issuer: issuer.replace(/\/$/, ''),
      clientId,
      clientSecret,
      scopes: process.env.OIDC_SCOPES || 'openid profile email',
      extra: {},
    };
  }

  isConfigured() {
    return (['google', 'microsoft', 'oidc'] as const).some((p) => this.configDe(p) !== null);
  }

  status() {
    const proveedores = {
      google: this.configDe('google') !== null,
      microsoft: this.configDe('microsoft') !== null,
      oidc: this.configDe('oidc') !== null,
    };
    return {
      enabled: proveedores.google || proveedores.microsoft || proveedores.oidc,
      proveedores,
      provider: process.env.OIDC_PROVIDER_NAME || 'oidc',
      issuer: process.env.OIDC_ISSUER || null,
    };
  }

  /** La misma para todos los proveedores; se registra tal cual en Google Cloud y en Entra. */
  redirectUri(): string {
    const fija = process.env.OIDC_REDIRECT_URI?.trim();
    if (fija) return fija;
    const base = (process.env.API_PUBLIC_URL?.trim() ||
      (PRODUCCION() ? 'https://core.nexara.com.mx/api' : 'http://localhost:3001/api')).replace(/\/+$/, '');
    return `${base}/auth/oidc/callback`;
  }

  /** Web a la que se vuelve si el origen no viene o no es de NEXARA. */
  webPredeterminada(): string {
    return (process.env.WEB_PUBLIC_URL?.trim() ||
      (PRODUCCION() ? 'https://core.nexara.com.mx' : 'http://localhost:3000')).replace(/\/+$/, '');
  }

  /** Secreto con el que se firma la cookie `nx_sso`. */
  secretoEstado(): string {
    const s = process.env.SSO_STATE_SECRET?.trim() || process.env.JWT_SECRET?.trim();
    if (!s) throw new ServiceUnavailableException('SSO sin secreto para firmar el estado');
    return s;
  }

  async iniciar(opts: {
    proveedor: unknown;
    recordar: boolean;
    next: unknown;
    vuelta: unknown;
  }): Promise<{ url: string; cookie: string; vuelta: string }> {
    const proveedor: ProveedorSso = esProveedorSso(opts.proveedor) ? opts.proveedor : 'oidc';
    const cfg = this.configDe(proveedor);
    if (!cfg) throw new BadRequestException(`El acceso con ${proveedor} no está configurado`);
    const disco = await this.discover(cfg.issuer);
    if (!disco.authorization_endpoint) throw new ServiceUnavailableException('OIDC sin authorization_endpoint');

    const { verifier, challenge } = pkce();
    const vuelta = vueltaSegura(opts.vuelta, this.webPredeterminada(), !PRODUCCION());
    const estado: EstadoSso = {
      proveedor,
      state: aleatorio(24),
      nonce: aleatorio(24),
      verifier,
      recordar: opts.recordar === true,
      next: nextSeguro(opts.next),
      vuelta,
      t: Date.now(),
    };
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      scope: cfg.scopes,
      state: estado.state,
      nonce: estado.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...cfg.extra,
    });
    return {
      url: `${disco.authorization_endpoint}?${params.toString()}`,
      cookie: firmarEstado(estado, this.secretoEstado()),
      vuelta,
    };
  }

  /** Canjea el código y devuelve la cuenta de NEXARA que corresponde al correo confiable. */
  async completar(estado: EstadoSso, code: string) {
    const cfg = this.configDe(estado.proveedor);
    if (!cfg) throw new ErrorSso('proveedor');
    const disco = await this.discover(cfg.issuer);
    if (!disco.token_endpoint) throw new ServiceUnavailableException('OIDC discovery incompleto');

    const tokenRes = await axios.post(
      disco.token_endpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: estado.verifier,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      },
    );
    if (tokenRes.status >= 400 || !tokenRes.data?.id_token) {
      this.logger.warn(`SSO ${estado.proveedor}: el proveedor rechazó el código (${tokenRes.status} ${tokenRes.data?.error ?? ''})`);
      throw new ErrorSso('token');
    }

    const claims = claimsDeIdToken(tokenRes.data.id_token);
    if (!claims || !idTokenValido(estado.proveedor, claims, { clientId: cfg.clientId, nonce: estado.nonce, issuer: cfg.issuer })) {
      throw new ErrorSso('token');
    }

    let tenantDelDominio: string | null = null;
    if (estado.proveedor === 'microsoft') {
      const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? '');
      if (email.includes('@')) tenantDelDominio = await this.tenantDelDominio(dominioDe(email));
    }
    const identidad = identidadConfiable(estado.proveedor, claims, tenantDelDominio);
    if (!identidad.ok) throw new ErrorSso(identidad.motivo);

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: identidad.email, mode: 'insensitive' } },
      include: { role: true, department: true },
    });
    if (!user) throw new ErrorSso('no_provisionado');
    if (user.isActive === false) throw new ErrorSso('inactivo');

    // Vínculo con la identidad del proveedor (la última con la que entró), para auditoría.
    if (user.oidcProvider !== estado.proveedor || user.oidcSubject !== identidad.subject) {
      await this.prisma.user
        .update({ where: { id: user.id }, data: { oidcProvider: estado.proveedor, oidcSubject: identidad.subject } })
        .catch((e) => this.logger.warn(`SSO: no se guardó el vínculo del usuario ${user.id}: ${e?.message ?? e}`));
    }
    return user;
  }

  /**
   * Inquilino de Entra dueño de un dominio de correo (p. ej. `nexara.com.mx` → su GUID).
   * `null` si el dominio no está en Microsoft 365.
   */
  private async tenantDelDominio(dominio: string): Promise<string | null> {
    const cache = this.tenants.get(dominio);
    if (cache && Date.now() - cache.at < 3600_000) return cache.tenant;
    const res = await axios
      .get(`https://login.microsoftonline.com/${encodeURIComponent(dominio)}/v2.0/.well-known/openid-configuration`, {
        timeout: 10000,
        validateStatus: () => true,
      })
      .catch(() => null);
    const tenant = res && res.status < 400 ? tenantDeIssuer(res.data?.issuer) : null;
    this.tenants.set(dominio, { at: Date.now(), tenant });
    return tenant;
  }

  private async discover(issuer: string) {
    const cache = this.discovery.get(issuer);
    if (cache && Date.now() - cache.at < 3600_000) return cache.data;
    const res = await axios.get(`${issuer}/.well-known/openid-configuration`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      throw new ServiceUnavailableException(`OIDC discovery falló (${res.status})`);
    }
    this.discovery.set(issuer, { at: Date.now(), data: res.data });
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
