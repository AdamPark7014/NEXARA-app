import { Module } from '@nestjs/common';
import { ToolRequestsService } from './tool-requests.service.js';
import { ToolRequestsController } from './tool-requests.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ToolRequestsController],
  providers: [ToolRequestsService],
  exports: [ToolRequestsService],
})
export class ToolRequestsModule {}
