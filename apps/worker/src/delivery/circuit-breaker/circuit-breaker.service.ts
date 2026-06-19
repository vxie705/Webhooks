import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

@Injectable()
export class CircuitBreakerService {
  private readonly FAILURE_THRESHOLD = 5;
  private readonly TIMEOUT_OPEN_MS = 30_000;
  private readonly HALF_OPEN_JITTER_MS = 5000; // 0-5s aleatorio para evitar thundering herd

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

  private readonly redis: Redis;

  async getState(destinationId: string): Promise<CircuitState> {
    const state = await this.redis.get(`cb:state:${destinationId}`);
    return (state as CircuitState) ?? CircuitState.CLOSED;
  }

  async recordFailure(destinationId: string): Promise<void> {
    const currentState = await this.getState(destinationId);

    // BUGFIX 1: In HALF_OPEN, a single failure immediately re-opens the circuit
    if (currentState === CircuitState.HALF_OPEN) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());
      return;
    }

    const key = `cb:fails:${destinationId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, Math.ceil(this.TIMEOUT_OPEN_MS / 1000));

    if (count >= this.FAILURE_THRESHOLD) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
      // BUGFIX 2: Record timestamp when circuit opens, so canProceed() can check timeout
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());
    }
  }

  async recordSuccess(destinationId: string): Promise<void> {
    await this.redis.del(`cb:fails:${destinationId}`);
    const currentState = await this.getState(destinationId);
    if (currentState === CircuitState.HALF_OPEN) {
      await this.transitionTo(destinationId, CircuitState.CLOSED);
    } else if (currentState === CircuitState.CLOSED) {
      // Reset the last_attempt so stale entries don't cause issues
      await this.redis.del(`cb:last_attempt:${destinationId}`);
    }
  }

  async transitionTo(destinationId: string, state: CircuitState): Promise<void> {
    await this.redis.set(`cb:state:${destinationId}`, state);
  }

  async canProceed(destinationId: string): Promise<boolean> {
    const state = await this.getState(destinationId);
    if (state === CircuitState.CLOSED) return true;

    if (state === CircuitState.OPEN) {
      const lastAttempt = await this.redis.get(`cb:last_attempt:${destinationId}`);
      const now = Date.now();
      
      // Agregar jitter aleatorio para evitar thundering herd
      const jitter = Math.random() * this.HALF_OPEN_JITTER_MS;
      const timeoutWithJitter = this.TIMEOUT_OPEN_MS + jitter;
      
      if (!lastAttempt || now - parseInt(lastAttempt) > timeoutWithJitter) {
        await this.transitionTo(destinationId, CircuitState.HALF_OPEN);
        await this.redis.set(`cb:last_attempt:${destinationId}`, now.toString());
        return true;
      }
      return false;
    }

    // HALF_OPEN – allow one probe request
    return true;
  }
}