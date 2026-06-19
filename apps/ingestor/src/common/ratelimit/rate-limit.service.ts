import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimitService {
  private readonly WINDOW_MS = 60_000; // 1 minuto
  private readonly MAX_REQUESTS = 1000; // por ventana
  private readonly logger = new Logger(RateLimitService.name);

  private readonly redis: Redis;

  // Script Lua atómico para evitar race conditions en distributed systems
  private readonly rateLimitScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      connectTimeout: 10000,
      lazyConnect: true,
    });
  }

  async isRateLimited(clientId: string): Promise<boolean> {
    try {
      const key = `ratelimit:${clientId}`;
      // Usar script Lua atómico para evitar race conditions
      const current = await this.redis.eval(
        this.rateLimitScript,
        1,
        key,
        this.WINDOW_MS,
      ) as number;

      return current > this.MAX_REQUESTS;
    } catch (error) {
      this.logger.error(`Rate limit check failed for ${clientId}: ${error.message}`);
      // Fail open: si Redis falla, permitir el request
      // En producción, considerar fail closed para mayor seguridad
      return false;
    }
  }
}
