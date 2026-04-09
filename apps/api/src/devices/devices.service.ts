import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterFcmTokenDto, RegisterWebPushDto } from './dto/register-push.dto.js';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerFcmToken(userId: number, dto: RegisterFcmTokenDto) {
    const token = dto.token.trim();
    if (!token) return { ok: false as const, reason: 'empty_token' };

    const row = await this.prisma.userPushEndpoint.upsert({
      where: { fcmToken: token },
      create: { userId, fcmToken: token },
      update: { userId },
    });

    this.logger.log(`FCM token registered for user ${userId} (endpoint #${row.id})`);
    return { ok: true as const, id: row.id };
  }

  async registerWebPush(userId: number, dto: RegisterWebPushDto) {
    const endpoint = dto.subscription.endpoint?.trim();
    if (!endpoint) return { ok: false as const, reason: 'empty_endpoint' };

    const row = await this.prisma.userPushEndpoint.upsert({
      where: { webPushEndpoint: endpoint },
      create: {
        userId,
        webPushEndpoint: endpoint,
        webPushKeys: dto.subscription.keys as object,
      },
      update: {
        userId,
        webPushKeys: dto.subscription.keys as object,
      },
    });

    this.logger.log(`Web push subscription for user ${userId} (endpoint #${row.id})`);
    return { ok: true as const, id: row.id };
  }

  async removeWebPush(userId: number, endpoint: string) {
    await this.prisma.userPushEndpoint.deleteMany({
      where: { userId, webPushEndpoint: endpoint },
    });
    return { ok: true as const };
  }
}
