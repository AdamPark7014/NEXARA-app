import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { WarehouseService } from './warehouse.service.js';
import { WarehouseController } from './warehouse.controller.js';
import { StockController } from './stock.controller.js';
import { ReabastecimientoService } from './reabastecimiento.service.js';
import { ReabastecimientoCronService } from './reabastecimiento-cron.service.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, AccountingModule],
  controllers: [WarehouseController, StockController],
  providers: [WarehouseService, ReabastecimientoService, ReabastecimientoCronService],
  exports: [WarehouseService, ReabastecimientoService],
})
export class WarehouseModule {}
