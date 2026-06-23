import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HeroSlidesController } from './hero-slides.controller.js';
import { HeroSlidesService } from './hero-slides.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [HeroSlidesController],
  providers: [HeroSlidesService],
})
export class HeroSlidesModule {}
