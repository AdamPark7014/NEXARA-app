import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './services/access-control.service';
import { HikvisionApiService } from './services/hikvision-api.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [AccessControlController],
  providers: [AccessControlService, HikvisionApiService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
