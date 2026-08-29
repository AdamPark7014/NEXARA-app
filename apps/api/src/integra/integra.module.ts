import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntegraController } from './integra.controller';
import { IntegraArtemisService } from './integra-artemis.service';

@Module({
  imports: [ConfigModule],
  controllers: [IntegraController],
  providers: [IntegraArtemisService],
  exports: [IntegraArtemisService],
})
export class IntegraModule {}
