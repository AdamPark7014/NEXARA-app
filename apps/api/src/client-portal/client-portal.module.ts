import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClientPortalController } from './client-portal.controller.js';
import { ClientPortalGuard } from './client-portal.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceClientsModule } from '../service-clients/service-clients.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';
import { InventoriesModule } from '../inventories/inventories.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ServiceClientsModule, ActivitiesModule, InventoriesModule, AccountingModule, CotizacionesModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalGuard],
})
export class ClientPortalModule {}
