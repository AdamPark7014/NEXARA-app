import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WarehouseService } from './warehouse.service.js';
import { WarehouseController } from './warehouse.controller.js';
import { StockController } from './stock.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [WarehouseController, StockController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
