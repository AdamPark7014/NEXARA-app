import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * RealtimeModule — proveedor global del `RealtimeGateway`.
 *
 * Se marca como @Global para que cualquier módulo (Prisma, Attendance,
 * ContactMessages, Projects, etc.) pueda inyectar `RealtimeGateway` sin
 * tener que importar este módulo explícitamente. La única fuente del
 * gateway en toda la app vive aquí.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
