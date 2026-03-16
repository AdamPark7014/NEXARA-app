import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import {
  createInMemoryWsConnectionGuard,
  getClientIpFromRequestMeta,
  isOriginAllowed,
} from '../common/security/security.utils';

const wsConnectionGuard = createInMemoryWsConnectionGuard(
  Number(process.env['WS_MAX_CONNECTIONS_PER_IP'] || 50),
);

@WebSocketGateway({
  transports: ['websocket', 'polling'],
  allowEIO3: false,
  maxHttpBufferSize: Number(process.env['WS_MAX_HTTP_BUFFER_SIZE'] || 1_000_000),
  perMessageDeflate: false,
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by WebSocket CORS'));
    },
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: any) {
    const origin = client?.handshake?.headers?.origin;
    const ip = getClientIpFromRequestMeta(
      client?.handshake?.headers?.['x-forwarded-for'],
      client?.handshake?.address,
    );

    if (!isOriginAllowed(origin)) {
      client.disconnect(true);
      return;
    }

    const connectionAttempt = wsConnectionGuard.open(ip);
    if (!connectionAttempt.allowed) {
      client.disconnect(true);
      return;
    }

    // ── JWT Authentication ──────────────────────────────
    const token =
      client?.handshake?.auth?.token ||
      client?.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const secret = process.env['JWT_SECRET'];

    if (!token || !secret) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = jwt.verify(token, secret) as Record<string, unknown>;
      const userId = payload.sub;
      const departmentId = payload.departmentId;

      // Join user and department rooms for scoped broadcasts
      if (userId) client.join(`user:${userId}`);
      if (departmentId) client.join(`dept:${departmentId}`);
      client.join('authenticated');
      (client as any).__userId = userId;
      (client as any).__departmentId = departmentId;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: any) {
    const ip = getClientIpFromRequestMeta(
      client?.handshake?.headers?.['x-forwarded-for'],
      client?.handshake?.address,
    );
    wsConnectionGuard.close(ip);
  }

  /** Emit to all authenticated clients (default). */
  emit(event: string, payload: unknown) {
    this.server.to('authenticated').emit(event, payload);
  }

  /** Emit to a specific user room. */
  emitToUser(userId: number | string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /** Emit to a specific department room. */
  emitToDepartment(departmentId: number | string, event: string, payload: unknown) {
    this.server.to(`dept:${departmentId}`).emit(event, payload);
  }
}
