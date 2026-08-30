import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaHealthIndicator } from './prisma.health';
import { InfraHealthIndicator } from './infra.health';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, InfraHealthIndicator],
})
export class HealthModule {}
