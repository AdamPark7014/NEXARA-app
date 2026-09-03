import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Alta automática de la caja on-site de un sitio (ADR-0021).
 *
 * El problema que resuelve: el enlace descrito en INTEGRA-LAN-ENLACE pide
 * generar claves WireGuard a mano y editar `wg0.conf` en el servidor por cada
 * sitio. Eso funciona para el primero y es insostenible para el décimo.
 *
 * Aquí la caja llega con un **token de alta de un solo uso**, manda su clave
 * pública, y el servidor le asigna su IP dentro del túnel y le devuelve todo lo
 * que necesita para levantarse sola. Nadie edita nada a mano.
 *
 * Lo que este servicio **no** hace es tocar WireGuard: la API vive en un
 * contenedor y no tiene por qué ser root en el anfitrión. Solo deja el peer
 * declarado en la base; un reconciliador en el anfitrión
 * (`deploy/edge/wg-reconcile.sh`) lo aplica con `wg set`.
 */

type Actor = { id?: number; email?: string };

export type EdgeEnrollResult = {
  siteId: number;
  companyId: number;
  siteName: string;
  tunnelIp: string;
  tunnelCidr: string;
  serverPublicKey: string;
  serverEndpoint: string;
  /** Lo que la caja debe enrutar: solo la red del túnel, nunca su propia LAN. */
  allowedIps: string;
  keepalive: number;
  /** Token permanente del agente. Sustituye al de alta y no se vuelve a mostrar. */
  agentToken: string;
  apiBaseUrl: string | null;
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Comparación en tiempo constante; distinta longitud no debe cortocircuitar. */
function hashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Token opaco de 32 bytes. `base64url` para que viaje en headers sin escapar. */
const newToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class IntegraEdgeService {
  private readonly logger = new Logger(IntegraEdgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ config

  /** Prefijo /24 del túnel. La caja número N vive en `<prefijo>.N`. */
  private tunnelPrefix(): string {
    const raw = this.config.get<string>('INTEGRA_EDGE_WG_SUBNET') || '10.77.0.0/24';
    const [net] = raw.split('/');
    return net.split('.').slice(0, 3).join('.');
  }

  private serverPublicKey(): string {
    const k = this.config.get<string>('INTEGRA_EDGE_WG_SERVER_PUBKEY') || '';
    if (!k) {
      throw new BadRequestException(
        'INTEGRA_EDGE_WG_SERVER_PUBKEY no configurado. Corre deploy/edge/server-setup.sh.',
      );
    }
    return k;
  }

  private serverEndpoint(): string {
    const e = this.config.get<string>('INTEGRA_EDGE_WG_ENDPOINT') || '';
    if (!e) {
      throw new BadRequestException(
        'INTEGRA_EDGE_WG_ENDPOINT no configurado (ip-publica:51820).',
      );
    }
    return e;
  }

  /**
   * Siguiente IP libre del túnel. `.1` es el servidor, así que las cajas
   * empiezan en `.2`. Se busca hueco en vez de contar filas para poder
   * reutilizar la IP de un sitio dado de baja.
   */
  private async allocateTunnelIp(): Promise<string> {
    const prefix = this.tunnelPrefix();
    const taken = new Set(
      (
        await this.prisma.integraEdgeAgent.findMany({
          where: { tunnelIp: { not: null } },
          select: { tunnelIp: true },
        })
      ).map((a) => a.tunnelIp as string),
    );
    for (let host = 2; host <= 254; host++) {
      const ip = `${prefix}.${host}`;
      if (!taken.has(ip)) return ip;
    }
    throw new BadRequestException(
      `Se agotaron las IPs de ${prefix}.0/24 (253 sitios). Amplía INTEGRA_EDGE_WG_SUBNET.`,
    );
  }

  // ------------------------------------------------- administración

  /**
   * Emite el token de alta de un sitio. Se muestra **una sola vez**: solo se
   * guarda su sha256. Volver a llamar invalida el anterior, que es justo lo que
   * se quiere si el token se filtró o la instalación se quedó a medias.
   */
  async issueEnrollToken(
    companyId: number,
    siteId: number,
    actor?: Actor,
    ttlHours = 24,
  ): Promise<{ token: string; expiresAt: Date; siteId: number; installCommand: string }> {
    const site = await this.prisma.integraSite.findFirst({ where: { id: siteId, companyId } });
    if (!site) throw new NotFoundException('Sitio Integra no encontrado');

    const token = newToken();
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await this.prisma.integraEdgeAgent.upsert({
      where: { siteId },
      create: {
        companyId,
        siteId,
        enrollTokenHash: sha256(token),
        enrollTokenExpiresAt: expiresAt,
        status: 'PENDING',
      },
      update: {
        enrollTokenHash: sha256(token),
        enrollTokenExpiresAt: expiresAt,
        // Re-emitir invalida al agente anterior: la caja vieja deja de poder
        // latir y hay que volver a enrolarla. Es deliberado.
        agentTokenHash: null,
        status: 'PENDING',
        lastError: null,
      },
    });

    await this.auditSafe('integra.edge.token.issue', actor, companyId, siteId, {
      siteName: site.name,
      expiresAt,
    });

    const api = this.config.get<string>('INTEGRA_EDGE_API_URL') || '';
    return {
      token,
      expiresAt,
      siteId,
      installCommand: `curl -fsSL ${api || '<API_URL>'}/api/integra/edge/install.sh | sudo bash -s -- ${token}`,
    };
  }

  /** Estado de las cajas de una empresa, para la consola. */
  async list(companyId: number) {
    const agents = await this.prisma.integraEdgeAgent.findMany({
      where: { companyId },
      orderBy: { siteId: 'asc' },
      select: {
        siteId: true,
        status: true,
        tunnelIp: true,
        hostname: true,
        agentVersion: true,
        enrolledAt: true,
        lastSeenAt: true,
        lastSyncAt: true,
        lastError: true,
        enrollTokenExpiresAt: true,
        site: { select: { name: true, label: true, provider: true } },
      },
    });
    const now = Date.now();
    return agents.map((a) => ({
      ...a,
      // Sin latido en 5 min la damos por caída: el agente late cada 60 s.
      online: a.lastSeenAt ? now - a.lastSeenAt.getTime() < 5 * 60 * 1000 : false,
    }));
  }

  async revoke(companyId: number, siteId: number, actor?: Actor) {
    const agent = await this.prisma.integraEdgeAgent.findFirst({ where: { siteId, companyId } });
    if (!agent) throw new NotFoundException('Este sitio no tiene caja registrada');
    await this.prisma.integraEdgeAgent.update({
      where: { siteId },
      data: {
        status: 'REVOKED',
        agentTokenHash: null,
        enrollTokenHash: null,
        enrollTokenExpiresAt: null,
      },
    });
    await this.auditSafe('integra.edge.revoke', actor, companyId, siteId, {
      tunnelIp: agent.tunnelIp,
    });
    // El peer sigue en WireGuard hasta que el reconciliador pase: sin clave de
    // agente la caja ya no puede hacer nada, pero conviene no tardar.
    return { success: true, siteId, note: 'Peer se retira en el siguiente ciclo del reconciliador' };
  }

  // -------------------------------------------------------- la caja

  /**
   * Alta de la caja. Idempotente por diseño: si la caja se reinstala con el
   * mismo token todavía vigente, recupera **la misma** `tunnelIp`, para no
   * fragmentar el rango con cada reinstalación.
   */
  async enroll(input: {
    token: string;
    publicKey: string;
    hostname?: string;
    agentVersion?: string;
  }): Promise<EdgeEnrollResult> {
    const token = (input.token || '').trim();
    const publicKey = (input.publicKey || '').trim();
    if (!token || !publicKey) throw new BadRequestException('token y publicKey son obligatorios');
    // Clave WireGuard: 32 bytes en base64 → 44 chars terminados en '='.
    if (!/^[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]=$/.test(publicKey)) {
      throw new BadRequestException('publicKey no parece una clave WireGuard válida');
    }

    const hash = sha256(token);
    const candidates = await this.prisma.integraEdgeAgent.findMany({
      where: { status: 'PENDING', enrollTokenHash: { not: null } },
      include: { site: { select: { name: true } } },
    });
    const agent = candidates.find((a) => hashEquals(a.enrollTokenHash as string, hash));
    if (!agent) throw new ForbiddenException('Token de alta inválido o ya utilizado');
    if (agent.enrollTokenExpiresAt && agent.enrollTokenExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Token de alta expirado — emite uno nuevo desde la consola');
    }

    const tunnelIp = agent.tunnelIp ?? (await this.allocateTunnelIp());
    const agentToken = newToken();

    await this.prisma.integraEdgeAgent.update({
      where: { siteId: agent.siteId },
      data: {
        publicKey,
        tunnelIp,
        hostname: input.hostname?.slice(0, 120) ?? null,
        agentVersion: input.agentVersion?.slice(0, 40) ?? null,
        agentTokenHash: sha256(agentToken),
        // De un solo uso: se quema al enrolar.
        enrollTokenHash: null,
        enrollTokenExpiresAt: null,
        status: 'ENROLLED',
        enrolledAt: new Date(),
        lastSeenAt: new Date(),
        lastError: null,
      },
    });

    await this.auditSafe('integra.edge.enroll', undefined, agent.companyId, agent.siteId, {
      tunnelIp,
      hostname: input.hostname,
      agentVersion: input.agentVersion,
    });
    this.logger.log(`Caja enrolada para sitio ${agent.siteId} → ${tunnelIp}`);

    return {
      siteId: agent.siteId,
      companyId: agent.companyId,
      siteName: agent.site.name,
      tunnelIp,
      tunnelCidr: `${tunnelIp}/32`,
      serverPublicKey: this.serverPublicKey(),
      serverEndpoint: this.serverEndpoint(),
      // Solo la red del túnel. Enrutar la LAN del cliente rompe en cuanto dos
      // sitios comparten 192.168.1.0/24 — INTEGRA-LAN-ENLACE lo explica.
      allowedIps: `${this.tunnelPrefix()}.0/24`,
      keepalive: 25,
      agentToken,
      apiBaseUrl: this.config.get<string>('INTEGRA_EDGE_API_URL') || null,
    };
  }

  /** Resuelve el agente a partir de su token permanente. */
  private async agentByToken(token: string) {
    const t = (token || '').trim();
    if (!t) throw new ForbiddenException('Falta el token del agente');
    const hash = sha256(t);
    const candidates = await this.prisma.integraEdgeAgent.findMany({
      where: { status: 'ENROLLED', agentTokenHash: { not: null } },
    });
    const agent = candidates.find((a) => hashEquals(a.agentTokenHash as string, hash));
    if (!agent) throw new ForbiddenException('Token de agente inválido o revocado');
    return agent;
  }

  /**
   * Latido. Es lo que separa «la sucursal 7 está bien» de «me llamó el cliente».
   * Devuelve la configuración vigente para que la caja se entere de un cambio
   * sin que nadie entre a ella.
   */
  async heartbeat(
    token: string,
    body: { agentVersion?: string; lastSyncAt?: string; error?: string | null; cameras?: number },
  ) {
    const agent = await this.agentByToken(token);
    await this.prisma.integraEdgeAgent.update({
      where: { siteId: agent.siteId },
      data: {
        lastSeenAt: new Date(),
        agentVersion: body.agentVersion?.slice(0, 40) ?? agent.agentVersion,
        lastSyncAt: body.lastSyncAt ? new Date(body.lastSyncAt) : agent.lastSyncAt,
        lastError: body.error ? String(body.error).slice(0, 2000) : null,
      },
    });
    return {
      ok: true,
      siteId: agent.siteId,
      companyId: agent.companyId,
      tunnelIp: agent.tunnelIp,
      /** Segundos hasta el próximo latido esperado. */
      heartbeatSeconds: 60,
      syncSeconds: Number(this.config.get('INTEGRA_EDGE_SYNC_SECONDS') || 900),
    };
  }

  /**
   * Peers para el reconciliador del anfitrión. No lleva RBAC de usuario: se
   * autentica con `INTEGRA_EDGE_RECONCILE_TOKEN`, porque quien llama es un
   * script de systemd, no una persona.
   */
  async peersForReconciler(token: string) {
    const expected = this.config.get<string>('INTEGRA_EDGE_RECONCILE_TOKEN') || '';
    if (!expected) throw new BadRequestException('INTEGRA_EDGE_RECONCILE_TOKEN no configurado');
    if (!hashEquals(sha256(token || ''), sha256(expected))) {
      throw new ForbiddenException('Token de reconciliador inválido');
    }
    const agents = await this.prisma.integraEdgeAgent.findMany({
      where: { status: 'ENROLLED', publicKey: { not: null }, tunnelIp: { not: null } },
      select: { siteId: true, publicKey: true, tunnelIp: true },
      orderBy: { siteId: 'asc' },
    });
    return {
      peers: agents.map((a) => ({
        siteId: a.siteId,
        publicKey: a.publicKey as string,
        allowedIps: `${a.tunnelIp}/32`,
      })),
    };
  }

  private async auditSafe(
    action: string,
    actor: Actor | undefined,
    companyId: number,
    siteId: number,
    changes: Record<string, unknown>,
  ) {
    try {
      await this.audit.log(
        {
          entityType: 'Integra',
          entityId: siteId,
          action,
          changes,
          companyId,
          source: 'integra',
        },
        actor?.id,
      );
    } catch (e) {
      this.logger.warn(`Audit edge falló: ${String(e)}`);
    }
  }
}
