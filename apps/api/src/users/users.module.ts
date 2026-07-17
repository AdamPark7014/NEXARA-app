import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { RolesController } from './roles.controller.js';
import { ChatModule } from '../chat/chat.module.js';

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => ChatModule)],
  controllers: [UsersController, RolesController],
  providers: [UsersService, RbacGuard],
  exports: [UsersService],
})
export class UsersModule {}
