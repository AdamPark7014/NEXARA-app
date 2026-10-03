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
import { CatalogModule } from '../catalog/catalog.module.js';
import { CodigosBarrasService } from './codigos-barras.service.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, AccountingModule, CatalogModule],
  controllers: [WarehouseController, StockController],
  providers: [
    WarehouseService,
    ReabastecimientoService,
    ReabastecimientoCronService,
    CodigosBarrasService,
  ],
  exports: [WarehouseService, ReabastecimientoService],
})
export class WarehouseModule {}
