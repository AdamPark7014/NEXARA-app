import { Module } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class NotificationsGateway {
  @WebSocketServer()
    server!: Server;

  afterInit(_server: Server) {
    console.log('WebSocket server initialized');
  }

  handleConnection(client: any) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: any) {
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
