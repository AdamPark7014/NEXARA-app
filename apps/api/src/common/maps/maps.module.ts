import { Module } from '@nestjs/common';
import { StaticMapController } from './static-map.controller.js';

/** Todo lo que cuesta dinero en Google Maps pasa por aquí. */
@Module({
  controllers: [StaticMapController],
})
export class MapsModule {}
