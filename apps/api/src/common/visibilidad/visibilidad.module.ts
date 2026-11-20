import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { VisibilidadService } from './visibilidad.service.js';
import { CotizacionVisibleInterceptor } from './cotizacion-visible.interceptor.js';
import { AccesosController } from './accesos.controller.js';
import { OcultarMontosInterceptor } from './ocultar-montos.interceptor.js';

/** «Quién ve qué»: una sola política para todos los módulos (global). */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AccesosController],
  providers: [VisibilidadService, CotizacionVisibleInterceptor, OcultarMontosInterceptor],
  exports: [VisibilidadService, CotizacionVisibleInterceptor, OcultarMontosInterceptor],
})
export class VisibilidadModule {}
