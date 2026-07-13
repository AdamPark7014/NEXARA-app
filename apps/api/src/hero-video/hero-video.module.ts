import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HeroVideoController } from './hero-video.controller.js';
import { HeroVideoService } from './hero-video.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [HeroVideoController],
  providers: [HeroVideoService],
})
export class HeroVideoModule {}
