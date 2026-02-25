import { Module } from '@nestjs/common';
import { ToolRequestsService } from './tool-requests.service.js';
import { ToolRequestsController } from './tool-requests.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ToolRequestsController],
  providers: [ToolRequestsService],
  exports: [ToolRequestsService],
})
export class ToolRequestsModule {}
