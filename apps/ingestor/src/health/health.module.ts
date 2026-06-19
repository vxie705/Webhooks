import { Module } from '@nestjs/common';
import { DatabaseModule } from '@webhook-hub/database';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
