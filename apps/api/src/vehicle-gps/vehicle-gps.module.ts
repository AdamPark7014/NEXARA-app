import { Module } from '@nestjs/common';
import { PROVEEDOR_GPS, VehicleGpsService, proveedorDesdeEntorno } from './vehicle-gps.service.js';
import { VehicleGpsController } from './vehicle-gps.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VehicleGpsController],
  providers: [
    // El adaptador se elige por entorno (`VEHICLE_GPS_PROVEEDOR`). Sin
    // rastreadores montados, el simulador deja ver el mapa marcado como demo.
    { provide: PROVEEDOR_GPS, useFactory: () => proveedorDesdeEntorno() },
    VehicleGpsService,
  ],
  exports: [VehicleGpsService],
})
export class VehicleGpsModule {}
