import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from '@webhook-hub/database';
import { WebhookModule } from './webhook/webhook.module';
import { HealthModule } from './health/health.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { MetricsModule } from './common/metrics/metrics.module';
import { OpenTelemetryService } from './common/otel/opentelemetry.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    MetricsModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    WebhookModule,
    HealthModule,
  ],
  providers: [PinoLoggerService, OpenTelemetryService],
  exports: [PinoLoggerService, OpenTelemetryService],
})
export class AppModule {}
