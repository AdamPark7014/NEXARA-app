import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { RolesController } from './roles.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService, RbacGuard],
  exports: [UsersService],
})
export class UsersModule {}
