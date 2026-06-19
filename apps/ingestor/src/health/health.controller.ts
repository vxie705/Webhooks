import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@webhook-hub/database';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private readonly redis: Redis;

  constructor(private readonly prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  @Get()
  async check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  @Get('ready')
  async ready() {
    const health: Record<string, unknown> = {};

    // Verificar Redis
    try {
      await this.redis.ping();
      health.redis = { status: 'up' };
    } catch (error) {
      health.redis = { status: 'down', message: (error as Error).message };
    }

    // Verificar PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.postgres = { status: 'up' };
    } catch (error) {
      health.postgres = { status: 'down', message: (error as Error).message };
    }

    const allUp = Object.values(health).every(
      (h: any) => h.status === 'up',
    );

    return {
      status: allUp ? 'ok' : 'degraded',
      ...health,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  async live() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}