import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';
import { PushDispatchService } from './push-dispatch.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService, PushDispatchService],
  exports: [DevicesService, PushDispatchService],
})
export class DevicesModule {}
