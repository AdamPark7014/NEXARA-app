import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
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
    }
    this.logger.debug(`Socket conectado: ${client.id}${userId ? ` (user=${userId})` : ''}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket desconectado: ${client.id}`);
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
