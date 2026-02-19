import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly realtimeGateway: RealtimeGateway) {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    this.$use(async (params, next) => {
      const result = await next(params);

      const writeActions = new Set([
        'create',
        'update',
        'delete',
        'upsert',
        'createMany',
        'updateMany',
        'deleteMany',
      ]);

      if (params.model && writeActions.has(params.action)) {
        this.realtimeGateway.emit('entity:updated', {
          model: params.model,
          action: params.action,
          timestamp: new Date().toISOString(),
        });
      }

      return result;
    });
  }

  async onModuleInit() {
    await this['$connect']();
  }

  async onModuleDestroy() {
    await this['$disconnect']();
  }
}
