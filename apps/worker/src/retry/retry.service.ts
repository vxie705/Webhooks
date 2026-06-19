import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IWebhookEvent } from '@webhook-hub/shared';

@Injectable()
export class RetryService {
  constructor(@InjectQueue('webhooks') private readonly webhookQueue: Queue) {}

  async scheduleRetry(
    event: IWebhookEvent,
    delayMs: number,
    attempt: number,
  ): Promise<void> {
    await this.webhookQueue.add(
      'process-webhook',
      { ...event, attempt },
      {
        delay: delayMs,
        jobId: `${event.idempotencyKey}:retry:${attempt}`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}