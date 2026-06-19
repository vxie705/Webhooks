import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DeliveryStatus } from '@webhook-hub/shared';

@Injectable()
export class DeliveryAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    eventId: string;
    attempt: number;
    status: DeliveryStatus;
    httpStatus?: number;
    latencyMs?: number;
    error?: string;
    workerId: string;
  }) {
    return this.prisma.deliveryAttempt.create({
      data: {
        eventId: data.eventId,
        attempt: data.attempt,
        status: data.status as any,
        httpStatus: data.httpStatus,
        latencyMs: data.latencyMs,
        error: data.error,
        workerId: data.workerId,
      },
    });
  }

  async findByEventId(eventId: string) {
    return this.prisma.deliveryAttempt.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLatestByEventId(eventId: string) {
    return this.prisma.deliveryAttempt.findFirst({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }
}