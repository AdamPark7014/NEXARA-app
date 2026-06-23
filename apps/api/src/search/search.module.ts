import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [SearchService],
  controllers: [SearchController],
})
export class SearchModule {}
