import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { KbService } from './kb.service.js';
import { KbController, KbPublicController } from './kb.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [KbService],
  controllers: [KbController, KbPublicController],
  exports: [KbService],
})
export class KbModule {}
