import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookWorker } from './webhook.worker';
import { DeliveryService } from '../delivery/delivery.service';
import { CircuitBreakerService } from '../delivery/circuit-breaker/circuit-breaker.service';
import { RetryService } from '../retry/retry.service';
import { ExponentialBackoff } from '../retry/exponential-backoff';
import { HttpClientService } from '../delivery/http-client.service';
import { DatabaseModule } from '@webhook-hub/database';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    DatabaseModule,
  ],
  providers: [
    WebhookWorker,
    DeliveryService,
    CircuitBreakerService,
    RetryService,
    ExponentialBackoff,
    HttpClientService,
  ],
  exports: [
    WebhookWorker,
    DeliveryService,
    CircuitBreakerService,
    HttpClientService,
  ],
})
export class WebhookWorkerModule {}
