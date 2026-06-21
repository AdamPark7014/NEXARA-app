import { Module } from '@nestjs/common';
import { CaseStudiesController } from './case-studies.controller.js';
import { CaseStudiesService } from './case-studies.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CaseStudiesController],
  providers: [CaseStudiesService],
  exports: [CaseStudiesService],
})
export class CaseStudiesModule {}
