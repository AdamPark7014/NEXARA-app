import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

/**
 * RealtimeGateway — punto único de broadcast en tiempo real.
 *
 * Lo inyectan PrismaService, AttendanceService, ContactMessagesService,
 * ProjectsService y todos los flujos que necesitan empujar cambios al
 * frontend (sockets) sin acoplar la lógica de dominio a socket.io.
 *
 * Diseño:
 *  - Un solo `emit(event, payload)` para difusión global.
 *  - `emitToUser(userId, event, payload)` para canales privados por usuario.
 *  - `emitToRoom(room, event, payload)` para grupos arbitrarios (equipos,
 *    paneles, geozonas, etc.).
 *  - Si por cualquier motivo el server aún no está inicializado (p.ej.
 *    durante seeds o tests aislados), las llamadas a emit se vuelven no-op
 *    y se logean, en lugar de lanzar.
 */
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  // Mantenemos el namespace por defecto ('/'). Si más adelante separamos
  // por dominio (ops, crm, etc.) basta con clonar este gateway.
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

  /**
   * Broadcast global a todos los clientes conectados.
   * Operación idempotente: si el server aún no está listo, no hace nada.
   */
  emit(event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.verbose(`emit(${event}) ignorado: server no inicializado`);
      return;
    }
    this.server.emit(event, payload);
  }

  /** Broadcast a la "room" privada de un usuario (ver `roomForUser`). */
  emitToUser(userId: number | string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(this.roomForUser(userId)).emit(event, payload);
  }

  /** Broadcast a una room arbitraria (p.ej. equipo de ventas, área NOC). */
  emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(room).emit(event, payload);
  }

  private roomForUser(userId: number | string): string {
    return `user:${userId}`;
  }

  private extractUserId(client: Socket): number | string | null {
    // El handshake puede traer user en auth (JWT decodificado), query o headers.
    const auth = client.handshake?.auth as Record<string, unknown> | undefined;
    const query = client.handshake?.query as Record<string, unknown> | undefined;
    const candidate =
      (auth?.['userId'] as number | string | undefined) ??
      (auth?.['sub'] as number | string | undefined) ??
      (query?.['userId'] as string | undefined);
    return candidate ?? null;
  }
}
