import { Logger } from '@nestjs/common';
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

/**
 * RealtimeGateway — punto único de broadcast en tiempo real.
 *
 * Diseño:
 *  - Un solo `emit(event, payload)` para difusión global.
 *  - `emitToUser(userId, event, payload)` para canales privados por usuario.
 *  - `emitToRoom(room, event, payload)` para grupos arbitrarios.
 *  - `chat:join` / `chat:leave` para salas de workspace chat.
 *  - userId de rooms privadas solo se toma del JWT verificado (auth.token).
 */
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    this.logger.log(`Realtime gateway iniciado (path=${server.path?.() ?? '/socket.io'})`);
  }

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (userId) {
      client.join(this.roomForUser(userId));
      (client.data as { userId?: number | string }).userId = userId;
    }
    this.logger.debug(`Socket conectado: ${client.id}${userId ? ` (user=${userId})` : ''}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket desconectado: ${client.id}`);
  }

  @SubscribeMessage('chat:join')
  handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId?: number },
  ) {
    const userId = (client.data as { userId?: number | string }).userId ?? this.extractUserId(client);
    const channelId = Number(body?.channelId);
    if (!userId || !Number.isFinite(channelId) || channelId <= 0) {
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
    const userId = (client.data as { userId?: number | string }).userId ?? this.extractUserId(client);
    const channelId = Number(body?.channelId);
    if (!userId || !Number.isFinite(channelId) || channelId <= 0) {
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
    const userId = (client.data as { userId?: number | string }).userId ?? this.extractUserId(client);
    if (!userId) return { ok: false };
    const status = body?.status === 'away' ? 'away' : 'online';
    this.server?.emit('chat:presence', { userId: Number(userId), status, at: Date.now() });
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

  private roomForUser(userId: number | string): string {
    return `user:${userId}`;
  }

  private roomForChat(channelId: number): string {
    return `chat:${channelId}`;
  }

  private extractUserId(client: Socket): number | string | null {
    const auth = client.handshake?.auth as Record<string, unknown> | undefined;
    const headerAuth = client.handshake?.headers?.authorization;
    const rawToken =
      (typeof auth?.['token'] === 'string' && auth['token']) ||
      (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')
        ? headerAuth.slice(7)
        : null);

    if (!rawToken) {
      return null;
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      return null;
    }

    try {
      const payload = jwt.verify(rawToken, secret) as { sub?: number | string };
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
