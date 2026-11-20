import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NasPortalAuthzController } from './nas-portal-authz.controller';

/** Puerta de `nas.nexara.com.mx`: solo el `forwardAuth` que consulta Traefik. */
@Module({
  imports: [PrismaModule],
  controllers: [NasPortalAuthzController],
})
export class NasPortalModule {}
