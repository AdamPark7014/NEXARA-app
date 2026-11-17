import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { SolicitudAprobacionService } from './solicitud-aprobacion.service.js';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  providers: [SolicitudAprobacionService],
  exports: [SolicitudAprobacionService],
})
export class AprobacionesModule {}
