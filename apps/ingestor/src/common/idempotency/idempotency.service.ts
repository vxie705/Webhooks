import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class IdempotencyService {
  private readonly TTL_SECONDS = 3600;
  private readonly logger = new Logger(IdempotencyService.name);

  // Token único por instancia para evitar race conditions en releaseLock
  private readonly lockToken: string;

  private readonly redis: any;

  constructor() {
    this.lockToken = crypto.randomUUID();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      connectTimeout: 10000,
      lazyConnect: true,
    });
  }

  async tryAcquireLock(idempotencyKey: string): Promise<boolean> {
    try {
      const r = this.redis as any;
      // Usar token único en el valor del lock
      const result = await r.set(
        `idempotency:${idempotencyKey}`,
        this.lockToken,
        'NX',
        'EX',
        this.TTL_SECONDS,
      );
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire idempotency lock for ${idempotencyKey}: ${error.message}`);
      // Fail open: si Redis falla, permitir el request
      return false;
    }
  }

  async releaseLock(idempotencyKey: string): Promise<void> {
    try {
      const r = this.redis as any;
      // Solo liberar el lock si el valor coincide con nuestro token
      // Esto previene liberar locks de otros requests
      const token = await r.get(`idempotency:${idempotencyKey}`);
      if (token === this.lockToken) {
        await r.del(`idempotency:${idempotencyKey}`);
      }
    } catch (error) {
      this.logger.error(`Failed to release idempotency lock for ${idempotencyKey}: ${error.message}`);
    }
  }
}
