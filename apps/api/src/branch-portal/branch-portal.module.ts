import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BranchPortalController } from './branch-portal.controller.js';
import { BranchPortalGuard } from './branch-portal.guard.js';
import { InventoriesModule } from '../inventories/inventories.module.js';

@Module({
  imports: [PrismaModule, AuthModule, InventoriesModule],
  controllers: [BranchPortalController],
  providers: [BranchPortalGuard],
})
export class BranchPortalModule {}
