import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import {
  createInMemoryWsConnectionGuard,
  getClientIpFromRequestMeta,
  isOriginAllowed,
} from '../common/security/security.utils.js';
import { sessionTokenFromHeaders } from '../common/security/session-cookie.js';

interface SocketIdentity {
  userId: number | string | null;
  companyId: number | null;
}

type SocketData = {
  userId?: number | string;
  companyId?: number | null;
  ip?: string;
};

const wsConnectionGuard = createInMemoryWsConnectionGuard(
  Number(process.env['WS_MAX_CONNECTIONS_PER_IP']) > 0
    ? Number(process.env['WS_MAX_CONNECTIONS_PER_IP'])
    : 40,
);

/**
 * RealtimeGateway — punto único de broadcast en tiempo real.
 *
 * Diseño:
 *  - `emit(event, payload)` difunde a todos (solo para eventos no-tenant).
 *  - `emitToCompany(companyId, ...)` para difusión acotada a una empresa.
 *  - `emitToUser(userId, event, payload)` para canales privados por usuario.
 *  - `emitToRoom(room, event, payload)` para grupos arbitrarios.
 *  - `chat:join` / `chat:leave` para salas de workspace chat.
 *
 * Seguridad:
 *  - Solo se aceptan sockets con JWT válido; el resto se desconecta.
 *  - `chat:join` exige membresía real del canal (ChatChannelMember).
 *  - El origen se valida con la misma lista blanca que HTTP.
 */
@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    // La autenticación va en middleware de handshake, no en handleConnection:
    // así se resuelve la identidad ANTES de que el socket pueda emitir nada,
    // y un socket sin token nunca llega a establecerse.
    server.use(async (client: Socket, next: (err?: Error) => void) => {
      const ip = getClientIpFromRequestMeta(
        client.handshake?.headers?.['x-forwarded-for'],
        client.handshake?.address,
      );

      const { allowed } = wsConnectionGuard.open(ip);
      if (!allowed) {
        this.logger.warn(`Socket rechazado por límite de conexiones (ip=${ip})`);
        next(new Error('too_many_connections'));
        return;
      }

      const identity = await this.resolveIdentity(client);
      if (!identity.userId) {
        wsConnectionGuard.close(ip);
        this.logger.debug(`Socket sin token válido, rechazado (ip=${ip})`);
        next(new Error('unauthorized'));
        return;
      }

      const data = client.data as SocketData;
      data.ip = ip;
      data.userId = identity.userId;
      data.companyId = identity.companyId;
      next();
    });

    this.logger.log(`Realtime gateway iniciado (path=${server.path?.() ?? '/socket.io'})`);
  }

  handleConnection(client: Socket) {
    const data = client.data as SocketData;

    // Sin identidad el middleware ya habría rechazado el handshake; esto es
    // solo defensa en profundidad por si el gateway se monta sin él.
    if (!data.userId) {
      client.disconnect(true);
      return;
    }

    client.join(this.roomForUser(data.userId));
    if (data.companyId != null && data.companyId > 0) {
      client.join(this.roomForCompany(data.companyId));
    }

    this.logger.debug(
      `Socket conectado: ${client.id} (user=${data.userId}, company=${data.companyId ?? 'n/a'})`,
    );
  }

  handleDisconnect(client: Socket) {
    const ip = (client.data as SocketData).ip;
    if (ip) {
      wsConnectionGuard.close(ip);
    }
    this.logger.debug(`Socket desconectado: ${client.id}`);
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId?: number },
  ) {
    const userId = (client.data as SocketData).userId;
    const channelId = Number(body?.channelId);
    if (!userId || !Number.isFinite(channelId) || channelId <= 0) {
      return { ok: false };
    }

    // Sin esta comprobación cualquier usuario autenticado podría unirse a la
    // sala de cualquier canal (incluido el de otra empresa) y recibir todos
    // sus mensajes vía `chat:message`.
    const isMember = await this.isChannelMember(Number(userId), channelId);
    if (!isMember) {
      this.logger.warn(
        `chat:join denegado (user=${userId}, channel=${channelId}): sin membresía`,
      );
      return { ok: false };
    }

    client.join(this.roomForChat(channelId));
    return { ok: true, channelId };
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId?: number },
  ) {
    const channelId = Number(body?.channelId);
    if (!Number.isFinite(channelId) || channelId <= 0) {
      return { ok: false };
    }
    client.leave(this.roomForChat(channelId));
    return { ok: true, channelId };
  }

  @SubscribeMessage('chat:typing')
  handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId?: number; nombre?: string },
  ) {
    const userId = (client.data as SocketData).userId;
    const channelId = Number(body?.channelId);
    if (!userId || !Number.isFinite(channelId) || channelId <= 0) {
      return { ok: false };
    }
    // Solo quien ya pasó el control de membresía en `chat:join` está en la sala.
    if (!client.rooms.has(this.roomForChat(channelId))) {
      return { ok: false };
    }
    client.to(this.roomForChat(channelId)).emit('chat:typing', {
      channelId,
      userId: Number(userId),
      nombre: typeof body?.nombre === 'string' ? body.nombre.slice(0, 100) : 'Alguien',
      at: Date.now(),
    });
    return { ok: true };
  }

  @SubscribeMessage('chat:presence')
  handleChatPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { status?: 'online' | 'away' },
  ) {
    const data = client.data as SocketData;
    const userId = data.userId;
    if (!userId) return { ok: false };
    const status = body?.status === 'away' ? 'away' : 'online';
    const payload = { userId: Number(userId), status, at: Date.now() };

    // La presencia solo interesa (y solo debe verse) dentro de la propia empresa.
    if (data.companyId != null && data.companyId > 0) {
      this.emitToCompany(data.companyId, 'chat:presence', payload);
    } else {
      client.emit('chat:presence', payload);
    }
    return { ok: true };
  }

  emit(event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.verbose(`emit(${event}) ignorado: server no inicializado`);
      return;
    }
    this.server.emit(event, payload);
  }

  emitToUser(userId: number | string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(this.roomForUser(userId)).emit(event, payload);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(room).emit(event, payload);
  }

  /** Difusión acotada a una empresa: evita filtrar actividad entre tenants. */
  emitToCompany(companyId: number, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(this.roomForCompany(companyId)).emit(event, payload);
  }

  private roomForUser(userId: number | string): string {
    return `user:${userId}`;
  }

  private roomForChat(channelId: number): string {
    return `chat:${channelId}`;
  }

  private roomForCompany(companyId: number): string {
    return `company:${companyId}`;
  }

  /** Membresía real del canal. Falla cerrado ante cualquier error. */
  private async isChannelMember(userId: number, channelId: number): Promise<boolean> {
    if (!Number.isFinite(userId) || userId <= 0) return false;
    try {
      // Resolución perezosa: PrismaModule depende de RealtimeModule, así que
      // inyectarlo por constructor crearía un ciclo de módulos.
      const { PrismaService } = await import('../prisma/prisma.service.js');
      const prisma = this.moduleRef.get(PrismaService, { strict: false });
      const membership = await prisma.chatChannelMember.findFirst({
        where: { channelId, userId },
        select: { id: true },
      });
      return Boolean(membership);
    } catch (error) {
      this.logger.error(
        `No se pudo verificar membresía de canal (user=${userId}, channel=${channelId})`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  private async resolveIdentity(client: Socket): Promise<SocketIdentity> {
    const auth = client.handshake?.auth as Record<string, unknown> | undefined;
    // Orden: token explícito del cliente (app nativa) → cabecera → cookie
    // `HttpOnly`, que el navegador adjunta sola al handshake. Sin la vía cookie
    // el realtime se caería en cuanto el token dejara de ser legible desde JS.
    const rawToken =
      (typeof auth?.['token'] === 'string' && auth['token']) ||
      sessionTokenFromHeaders(client.handshake?.headers ?? {});

    if (!rawToken) {
      return { userId: null, companyId: null };
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      return { userId: null, companyId: null };
    }

    let payload: {
      sub?: number | string;
      companyId?: number | string;
      isSuperAdmin?: boolean;
      roleKey?: string;
      isClient?: boolean;
      isBranchUser?: boolean;
      clientId?: number;
      branchId?: number;
    };
    try {
      payload = jwt.verify(rawToken, secret) as typeof payload;
    } catch {
      return { userId: null, companyId: null };
    }

    // Tokens de portal (cliente / sucursal) no llevan `sub` pero sí companyId.
    if (payload.isClient || payload.isBranchUser) {
      const portalId = payload.isClient
        ? `client:${payload.clientId ?? ''}`
        : `branch:${payload.branchId ?? ''}`;
      const hasPortalId = payload.isClient ? payload.clientId != null : payload.branchId != null;
      return {
        userId: hasPortalId ? portalId : null,
        companyId: this.toCompanyId(payload.companyId),
      };
    }

    if (payload.sub == null) {
      return { userId: null, companyId: null };
    }

    return {
      userId: payload.sub,
      companyId: await this.resolveCompanyForUser(payload),
    };
  }

  private toCompanyId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private async resolveCompanyForUser(payload: {
    sub?: number | string;
    companyId?: number | string;
    isSuperAdmin?: boolean;
    roleKey?: string;
  }): Promise<number | null> {
    const fromToken = this.toCompanyId(payload.companyId);
    if (fromToken) return fromToken;

    try {
      const { CompanyService } = await import('../company/company.service.js');
      const companyService = this.moduleRef.get(CompanyService, { strict: false });
      const company = await companyService.resolveForUser({
        userId: Number(payload.sub),
        isSuperAdmin: Boolean(payload.isSuperAdmin) || payload.roleKey === 'super_admin',
      });
      return this.toCompanyId(company?.id);
    } catch {
      // Sin empresa resuelta el socket sigue conectado, pero no entra a
      // ninguna sala de empresa: no recibe difusiones de tenant.
      return null;
    }
  }
}
