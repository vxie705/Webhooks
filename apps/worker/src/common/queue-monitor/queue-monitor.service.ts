import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class QueueMonitorService implements OnModuleInit {
  private readonly logger = new Logger(QueueMonitorService.name);
  private readonly CHECK_INTERVAL_MS = 10_000; // 10 seconds

  constructor(private readonly metricsService: MetricsService) {}

  onModuleInit(): void {
    setInterval(() => this.checkQueueLag(), this.CHECK_INTERVAL_MS);
  }

  async checkQueueLag(): Promise<void> {
    try {
      const queue = this.metricsService as unknown as { setQueueLag: (seconds: number) => void };
      queue.setQueueLag(0);
    } catch (error) {
      this.logger.warn('Queue lag check failed', error);
    }
  }
}