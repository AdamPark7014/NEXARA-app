import { Body, Controller, Delete, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { DevicesService } from './devices.service.js';
import { RegisterFcmTokenDto, RegisterWebPushDto } from './dto/register-push.dto.js';

@Controller('devices')
@UseGuards(AuthGuard('jwt'))
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Registro de token FCM desde la APK (Capacitor). */
  @Post('push-token')
  async registerPushToken(@CurrentUser() user: any, @Body() body: RegisterFcmTokenDto) {
    if (user?.isClient || user?.isBranchUser || !user?.id) {
      return { ok: false, reason: 'forbidden' };
    }
    return this.devices.registerFcmToken(Number(user.id), body);
  }

  /** Suscripción Web Push (navegador) — requiere VAPID en el servidor. */
  @Post('web-push')
  async registerWebPush(@CurrentUser() user: any, @Body() body: RegisterWebPushDto) {
    if (user?.isClient || user?.isBranchUser || !user?.id) {
      return { ok: false, reason: 'forbidden' };
    }
    return this.devices.registerWebPush(Number(user.id), body);
  }

  @Delete('web-push')
  async removeWebPush(@CurrentUser() user: any, @Query('endpoint') endpoint?: string) {
    if (!user?.id || !endpoint) return { ok: false };
    return this.devices.removeWebPush(Number(user.id), endpoint);
  }
}
