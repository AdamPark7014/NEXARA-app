import { Global, Module, NestMiddleware, Injectable, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service.js';
import { MetricsController } from './metrics.controller.js';

@Injectable()
export class MetricsHttpMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      const route = (req.route?.path as string) || req.path || 'unknown';
      this.metrics.recordHttp(req.method, route, res.statusCode, Date.now() - start);
    });
    next();
  }
}

@Global()
@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsHttpMiddleware).forRoutes('*');
  }
}
