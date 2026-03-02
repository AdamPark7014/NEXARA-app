import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
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
    }
  }

  handleDisconnect(client: any) {
    const ip = getClientIpFromRequestMeta(
      client?.handshake?.headers?.['x-forwarded-for'],
      client?.handshake?.address,
    );
    wsConnectionGuard.close(ip);
  }

  emit(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }
}
