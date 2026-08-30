import { InfraHealthIndicator } from './infra.health';

describe('InfraHealthIndicator (Armor)', () => {
  const indicator = new InfraHealthIndicator();

  it('incluye clave redis en el JSON aunque no esté configurado', async () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_URI;
    const result = await indicator.checkRedis('redis');
    expect(result).toHaveProperty('redis');
    expect(result.redis.status).toBe('up');
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });
});
