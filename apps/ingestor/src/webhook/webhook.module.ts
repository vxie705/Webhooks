import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@webhook-hub/database';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { RateLimitService } from '../common/ratelimit/rate-limit.service';
import { PinoLoggerService } from '../common/logger/pino-logger.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { HmacGuard } from '../auth/hmac.guard';
import { IpWhitelistGuard } from '../auth/ip-whitelist.guard';
import { OAuth2Guard } from '../auth/oauth2.guard';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: 'webhooks',
    }),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    IdempotencyService,
    RateLimitService,
    PinoLoggerService,
    MetricsService,
    // Guards (necesitan DestinationRepository de DatabaseModule)
    ApiKeyGuard,
    HmacGuard,
    IpWhitelistGuard,
    OAuth2Guard,
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
