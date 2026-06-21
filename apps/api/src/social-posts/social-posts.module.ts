import { Module } from '@nestjs/common';
import { SocialPostsController } from './social-posts.controller.js';
import { SocialPostsService } from './social-posts.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [SocialPostsController],
  providers: [SocialPostsService],
  exports: [SocialPostsService],
})
export class SocialPostsModule {}
