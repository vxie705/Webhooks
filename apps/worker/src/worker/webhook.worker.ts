import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { IWebhookEvent, DeliveryStatus } from '@webhook-hub/shared';
import { DeliveryService } from '../delivery/delivery.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { DeliveryAttemptRepository } from '@webhook-hub/database';

@Processor('webhooks')
@Injectable()
export class WebhookWorker extends WorkerHost {
  private readonly logger = new Logger(WebhookWorker.name);

  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly metricsService: MetricsService,
    private readonly deliveryAttemptRepository: DeliveryAttemptRepository,
  ) {
    super();
  }

  async process(job: Job<IWebhookEvent>): Promise<void> {
    const start = Date.now();
    const eventId = job.data.id;

    try {
      this.logger.debug(`Processing event ${eventId}`);

      const result = await this.deliveryService.process(job.data);

      this.metricsService.recordDeliveryLatency(Date.now() - start, job.data.source);
      this.metricsService.incrementDeliveryCounter(result.status, job.data.source);

      if (result.status === DeliveryStatus.RETRYING) {
        this.logger.debug(`Event ${eventId} scheduled for retry`);
        return;
      }

      await job.updateProgress(100);
      this.logger.log(`Event ${eventId} processed: ${result.status}`);
    } catch (error) {
      this.metricsService.incrementErrorCount('worker_error', job.data.source);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process event ${eventId}: ${message}`);
      throw error;
    }
  }
}
