import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IWebhookEvent, DeliveryStatus } from '@webhook-hub/shared';
import { EventRepository } from '@webhook-hub/database';

@Injectable()
export class WebhookService {
  constructor(
    @InjectQueue('webhooks') private readonly webhookQueue: Queue,
    private readonly eventRepository: EventRepository,
  ) {}

  async enqueue(event: IWebhookEvent): Promise<{ id: string | undefined }> {
    const job = await this.webhookQueue.add('process-webhook', event, {
      jobId: event.idempotencyKey,
      removeOnComplete: true,
      removeOnFail: false,
    });
    return { id: job.id };
  }

  async persistEvent(event: IWebhookEvent): Promise<void> {
    await this.eventRepository.create({
      id: event.id,
      source: event.source,
      type: event.type,
      data: event.data,
      idempotencyKey: event.idempotencyKey,
      status: DeliveryStatus.PENDING,
    });
  }
}
