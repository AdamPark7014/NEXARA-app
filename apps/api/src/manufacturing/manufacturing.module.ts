import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ManufacturingService } from './manufacturing.service.js';
import { BomController } from './bom.controller.js';
import { ProductionController } from './production.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [ManufacturingService],
  controllers: [BomController, ProductionController],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
