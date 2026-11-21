import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiModule } from '../ai/ai.module.js';
import { DanosVehiculoService } from './danos-vehiculo.service.js';
import { AvisosRetrasoService } from './avisos-retraso.service.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, NotificationsModule, AiModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, DanosVehiculoService, AvisosRetrasoService],
  exports: [VehiclesService, DanosVehiculoService],
})
export class VehiclesModule {}
