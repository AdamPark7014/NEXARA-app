import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { detectDeviceFromUserAgent } from '../common/device-detector.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { clienteNativoSinIdentidad, deviceInfoNativo, origenChecada } from './asistencia-confiable.js';
import { EstadoUbicacionDto } from './dto/estado-ubicacion.dto.js';
import { registrarEstadoUbicacion } from './estado-ubicacion.js';

/**
 * La app avisa cuando la ubicación del teléfono se apaga, pierde el permiso o vuelve (Adam, 08-10:
 * «que nos registre si hay algún dispositivo con la ubicación apagada»). Va bajo `attendance/`
 * porque todo el personal ya puede escribir ahí; cada quien solo avisa de su propio teléfono.
 */
@Controller('attendance/estado-ubicacion')
export class EstadoUbicacionController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @Post()
  async avisar(@Body() dto: EstadoUbicacionDto, @Req() req: any, @CurrentCompanyId() companyId: number | null) {
    const userAgent = req?.headers?.['user-agent'];
    const nativo = clienteNativoSinIdentidad(userAgent);
    const registrado = await registrarEstadoUbicacion(this.prisma, {
      userId: req.user?.id,
      companyId: requireCompanyId(companyId),
      estado: dto.estado,
      fuente: 'APP',
      origen: origenChecada(userAgent, req?.headers),
      deviceInfo: nativo ? deviceInfoNativo(nativo) : detectDeviceFromUserAgent(userAgent, req?.headers),
    });
    return { ok: true, registrado };
  }
}
