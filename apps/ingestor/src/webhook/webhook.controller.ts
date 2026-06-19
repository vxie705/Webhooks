import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IWebhookEvent } from '@webhook-hub/shared';
import { WebhookService } from './webhook.service';
import { WebhookRequestDto } from './dto/webhook-request.dto';
import { WebhookResponseDto } from './dto/webhook-response.dto';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { RateLimitInterceptor } from '../common/ratelimit/rate-limit.guard';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { HmacGuard } from '../auth/hmac.guard';
import { IpWhitelistGuard } from '../auth/ip-whitelist.guard';
import { OAuth2Guard } from '../auth/oauth2.guard';
import { v4 as uuidv4 } from 'uuid';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post(':source/:type')
  @UseGuards(ApiKeyGuard, HmacGuard, IpWhitelistGuard, OAuth2Guard)
  @UseInterceptors(RateLimitInterceptor)
  async ingest(
    @Param('source') source: string,
    @Param('type') type: string,
    @Body() body: WebhookRequestDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<WebhookResponseDto> {
    const key = idempotencyKey ?? uuidv4();

    const acquired = await this.idempotencyService.tryAcquireLock(key);
    if (!acquired) {
      return { status: 'duplicate', id: key };
    }

    try {
      const event: IWebhookEvent = {
        id: uuidv4(),
        source: body.source,
        type: body.type,
        data: body.data,
        timestamp: new Date().toISOString(),
        idempotencyKey: key,
      };

      // Encolar en Redis (BullMQ)
      const job = await this.webhookService.enqueue(event);

      // Persistir evento en PostgreSQL (eventual consistency)
      await this.webhookService.persistEvent(event);

      return { status: 'accepted', id: job.id ?? key };
    } finally {
      await this.idempotencyService.releaseLock(key);
    }
  }
}
