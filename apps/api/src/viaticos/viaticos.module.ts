import { Module } from '@nestjs/common';
import { ViaticosService } from './viaticos.service.js';
import { ViaticosController } from './viaticos.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuthModule, PrismaModule, UsersModule, NotificationsModule],
  controllers: [ViaticosController],
  providers: [ViaticosService],
  exports: [ViaticosService],
})
export class ViaticosModule {}
