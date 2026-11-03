import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { RechazarCotizacionDto } from './dto/rechazar-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';

/**
 * El enlace que el cliente recibe por correo. Va aparte porque `CotizacionesController` lleva
 * `UrlAccessGuard` en toda la clase, que exige sesión: allá, el cliente recibía 401.
 * Solo responde por token, y lo que sale lo decide `vistaPublica`.
 */
@Controller('cotizaciones/public')
export class CotizacionesPublicasController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Get(':token')
  ver(@Param('token') token: string) {
    return this.cotizacionesService.getPublicByToken(token);
  }

  @Post(':token/sign')
  firmar(@Param('token') token: string, @Body() dto: SignCotizacionDto) {
    return this.cotizacionesService.signByToken(token, dto);
  }

  /** El cliente rechaza con motivo desde el enlace, sin tener que escribir un correo. */
  @Post(':token/rechazar')
  rechazar(@Param('token') token: string, @Body() dto: RechazarCotizacionDto) {
    return this.cotizacionesService.rechazarPorToken(token, dto.motivo, dto.nombre);
  }
}
