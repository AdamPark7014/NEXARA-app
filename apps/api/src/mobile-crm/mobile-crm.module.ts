import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CrmActivitiesModule } from '../crm-activities/crm-activities.module.js';
import { MobileCrmController } from './mobile-crm.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, CrmActivitiesModule],
  controllers: [MobileCrmController],
})
export class MobileCrmModule {}
