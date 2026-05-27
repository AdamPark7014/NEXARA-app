import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { ProcurementService } from './procurement.service.js';
import { RequisitionsController } from './requisitions.controller.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { SupplierEvaluationsController } from './supplier-evaluations.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, WorkflowModule],
  controllers: [RequisitionsController, PurchaseOrdersController, GoodsReceiptsController, SupplierEvaluationsController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
