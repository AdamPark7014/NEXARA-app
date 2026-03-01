import { Module } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  createInMemoryWsConnectionGuard,
  getClientIpFromRequestMeta,
  isOriginAllowed,
} from './common/security/security.utils';

const wsConnectionGuard = createInMemoryWsConnectionGuard(
  Number(process.env['WS_MAX_CONNECTIONS_PER_IP'] || 5),
);

@WebSocketGateway({
  transports: ['websocket'],
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
export class NotificationsGateway {
  @WebSocketServer()
    server!: Server;

  afterInit(_server: Server) {
    console.log('WebSocket server initialized');
  }

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

    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: any) {
    const ip = getClientIpFromRequestMeta(
      client?.handshake?.headers?.['x-forwarded-for'],
      client?.handshake?.address,
    );
    wsConnectionGuard.close(ip);
    console.log('Client disconnected:', client.id);
  }

  // Método para emitir notificaciones a todos
  sendNotification(payload: any) {
    this.server.emit('notification', payload);
  }

  // Ejemplo: recibir mensaje de prueba
  @SubscribeMessage('test')
  handleTest(@MessageBody() data: any) {
    this.server.emit('notification', { message: 'Test recibido', data });
  }
}

@Module({
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}
