import { Injectable, Logger } from '@nestjs/common';
import { IWebhookEvent, IDeliveryResultDto, DeliveryStatus } from '@webhook-hub/shared';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { ExponentialBackoff } from '../retry/exponential-backoff';
import { RetryService } from '../retry/retry.service';
import { HttpClientService } from './http-client.service';
import { DeliveryAttemptRepository } from '@webhook-hub/database';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly retryService: RetryService,
    private readonly httpClientService: HttpClientService,
    private readonly deliveryAttemptRepository: DeliveryAttemptRepository,
  ) {}

  async process(event: IWebhookEvent): Promise<IDeliveryResultDto> {
    const start = Date.now();
    const destinationId = event.source;

    // 1. Circuit Breaker Check
    const canProceed = await this.circuitBreakerService.canProceed(destinationId);
    if (!canProceed) {
      const result = this.createFailedResult(event, 'Circuit OPEN - request blocked');
      await this.persistDeliveryAttempt(event, result);
      return result;
    }

    // 2. HTTP Delivery
    try {
      const destination = await this.getDestination(destinationId);
      const response = await this.httpClientService.post(destination.url, event);

      const latency = Date.now() - start;
      await this.circuitBreakerService.recordSuccess(destinationId);

      const result: IDeliveryResultDto = {
        eventId: event.id,
        status: DeliveryStatus.DELIVERED,
        httpStatus: response.status,
        latencyMs: latency,
        attempt: event.attempt ?? 1,
        timestamp: new Date().toISOString(),
      };

      await this.persistDeliveryAttempt(event, result);
      return result;
    } catch (error) {
      await this.circuitBreakerService.recordFailure(destinationId);
      return await this.handleDeliveryError(event, error, start);
    }
  }

  private async handleDeliveryError(
    event: IWebhookEvent,
    error: unknown,
    start: number,
  ): Promise<IDeliveryResultDto> {
    const nextAttempt = (event.attempt ?? 1) + 1;
    const errorMessage = this.extractErrorMessage(error);
    const latency = Date.now() - start;

    if (ExponentialBackoff.shouldRetry(nextAttempt)) {
      const delayMs = ExponentialBackoff.getDelayMs(nextAttempt);
      await this.retryService.scheduleRetry(event, delayMs, nextAttempt);

      const result: IDeliveryResultDto = {
        eventId: event.id,
        status: DeliveryStatus.RETRYING,
        attempt: nextAttempt,
        latencyMs: latency,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };

      await this.persistDeliveryAttempt(event, result);
      return result;
    }

    // Dead Letter
    const result: IDeliveryResultDto = {
      eventId: event.id,
      status: DeliveryStatus.DEAD_LETTER,
      attempt: nextAttempt,
      latencyMs: latency,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };

    await this.persistDeliveryAttempt(event, result);
    return result;
  }

  private async persistDeliveryAttempt(
    event: IWebhookEvent,
    result: IDeliveryResultDto,
  ): Promise<void> {
    try {
      await this.deliveryAttemptRepository.create({
        eventId: event.id,
        attempt: result.attempt,
        status: result.status,
        httpStatus: result.httpStatus,
        latencyMs: result.latencyMs,
        error: result.error,
        workerId: process.env.WORKER_ID ?? 'unknown',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to persist delivery attempt: ${message}`);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  private createFailedResult(event: IWebhookEvent, error: string): IDeliveryResultDto {
    return {
      eventId: event.id,
      status: DeliveryStatus.FAILED,
      attempt: event.attempt ?? 1,
      latencyMs: 0,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private async getDestination(destinationId: string): Promise<{ url: string }> {
    // TODO: Obtener destino desde BD
    // Por ahora, retornar un stub para testing
    return {
      url: 'http://httpbin.org/post',
    };
  }
}
