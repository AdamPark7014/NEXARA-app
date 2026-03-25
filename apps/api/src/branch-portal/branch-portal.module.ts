import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BranchPortalController } from './branch-portal.controller.js';
import { BranchPortalGuard } from './branch-portal.guard.js';
import { InventoriesModule } from '../inventories/inventories.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { ServiceClientsModule } from '../service-clients/service-clients.module.js';

@Module({
  imports: [PrismaModule, AuthModule, InventoriesModule, ActivitiesModule, ServiceClientsModule],
  controllers: [BranchPortalController],
  providers: [BranchPortalGuard],
})
export class BranchPortalModule {}
