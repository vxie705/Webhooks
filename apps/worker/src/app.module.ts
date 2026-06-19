import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@webhook-hub/database';
import { WebhookWorkerModule } from './worker/webhook.worker.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { QueueMonitorModule } from './common/queue-monitor/queue-monitor.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { OpenTelemetryService } from './common/otel/opentelemetry.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    MetricsModule,
    QueueMonitorModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    WebhookWorkerModule,
  ],
  providers: [PinoLoggerService, OpenTelemetryService],
  exports: [PinoLoggerService, OpenTelemetryService],
})
export class AppModule {}
