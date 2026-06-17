import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PageContentController } from './page-content.controller.js';
import { PageContentService } from './page-content.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PageContentController],
  providers: [PageContentService],
  exports: [PageContentService],
})
export class PageContentModule {}
