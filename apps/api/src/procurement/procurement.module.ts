import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { WarehouseModule } from '../warehouse/warehouse.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ProcurementService } from './procurement.service.js';
import { RequisitionsController } from './requisitions.controller.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { SupplierEvaluationsController } from './supplier-evaluations.controller.js';
import { RfqController } from './rfq.controller.js';
import { WholesaleService } from './wholesale.service.js';
import { WholesaleController } from './wholesale.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    WorkflowModule,
    WarehouseModule,
    AccountingModule,
    AuditModule,
  ],
  controllers: [
    WholesaleController,
    RequisitionsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    SupplierEvaluationsController,
    RfqController,
  ],
  providers: [ProcurementService, WholesaleService],
  exports: [ProcurementService, WholesaleService],
})
export class ProcurementModule {}
