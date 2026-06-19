import { Module } from '@nestjs/common';
import { QueueMonitorService } from './queue-monitor.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [QueueMonitorService],
  exports: [QueueMonitorService],
})
export class QueueMonitorModule {}