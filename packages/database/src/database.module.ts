import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventRepository } from './event.repository';
import { DeliveryAttemptRepository } from './delivery-attempt.repository';
import { DestinationRepository } from './destination.repository';

@Module({
  providers: [
    PrismaService,
    EventRepository,
    DeliveryAttemptRepository,
    DestinationRepository,
  ],
  exports: [
    PrismaService,
    EventRepository,
    DeliveryAttemptRepository,
    DestinationRepository,
  ],
})
export class DatabaseModule {}