import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InventoriesController } from './inventories.controller.js';
import { InventoriesService } from './inventories.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [InventoriesController],
  providers: [InventoriesService],
  exports: [InventoriesService],
})
export class InventoriesModule {}
