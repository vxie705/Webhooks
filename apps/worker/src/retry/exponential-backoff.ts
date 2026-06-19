import { Injectable } from '@nestjs/common';

@Injectable()
export class ExponentialBackoff {
  static getDelayMs(
    attempt: number,
    baseDelayMs = 1_000,
    maxDelayMs = 60_000,
  ): number {
    const exponential = baseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, maxDelayMs);
    const jitter = Math.random() * 0.1 * capped;
    return Math.floor(capped + jitter);
  }

  static shouldRetry(attempt: number, maxRetries = 5): boolean {
    return attempt <= maxRetries;
  }
}