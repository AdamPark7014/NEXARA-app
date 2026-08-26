import { RealtimeGateway } from '../realtime/realtime.gateway.js';

/** Adaptador para emitir `notification:new` vía Socket.IO. */
export const notificationsGatewayProvider = {
  provide: 'NOTIFICATIONS_GATEWAY',
  useFactory: (gateway: RealtimeGateway) => ({
    notifyUser(userId: number, payload: { event: string; notification: unknown }) {
      gateway.emitToUser(userId, payload.event, payload.notification);
    },
  }),
  inject: [RealtimeGateway],
};
