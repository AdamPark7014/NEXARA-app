import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

@Injectable()
export class InfraHealthIndicator extends HealthIndicator {
  /** Ping Redis por TCP (sin dependencia `redis` en el bundle API). */
  async checkRedis(key = 'redis'): Promise<HealthIndicatorResult> {
    const url = process.env.REDIS_URL || process.env.REDIS_URI || '';
    if (!url) {
      return this.getStatus(key, true, { configured: false, skipped: true });
    }
    try {
      const net = await import('node:net');
      const u = new URL(url);
      const host = u.hostname || '127.0.0.1';
      const port = Number(u.port || 6379);
      await new Promise<void>((resolve, reject) => {
        const s = net.createConnection({ host, port }, () => {
          s.end();
          resolve();
        });
        s.on('error', reject);
        s.setTimeout(2000, () => {
          s.destroy();
          reject(new Error('timeout'));
        });
      });
      return this.getStatus(key, true, { configured: true, mode: 'tcp' });
    } catch (error) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, {
          configured: true,
          message: (error as Error).message,
        }),
      );
    }
  }

  async checkGo2rtc(key = 'go2rtc'): Promise<HealthIndicatorResult> {
    const base =
      process.env.GO2RTC_URL ||
      process.env.GO2RTC_INTERNAL_URL ||
      process.env.GO2RTC_PUBLIC_URL ||
      '';
    if (!base) {
      return this.getStatus(key, true, { configured: false, skipped: true });
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      let res: Response | null = null;
      try {
        res = await fetch(base.replace(/\/$/, '') + '/', {
          method: 'GET',
          signal: ctrl.signal,
        });
      } catch {
        res = await fetch(base.replace(/\/$/, '') + '/api/streams', {
          method: 'GET',
          signal: ctrl.signal,
        });
      }
      clearTimeout(t);
      const ok = !!res && res.status < 500;
      if (!ok) {
        throw new Error(`HTTP ${res?.status}`);
      }
      return this.getStatus(key, true, { configured: true, status: res.status });
    } catch (error) {
      throw new HealthCheckError(
        'go2rtc check failed',
        this.getStatus(key, false, {
          configured: true,
          message: (error as Error).message,
        }),
      );
    }
  }
}
