import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { CTOnlineService } from './ctonline.service.js';
import { IcecatService } from './icecat.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, CTOnlineService, IcecatService],
  exports: [ProductsService],
})
export class ProductsModule {}
