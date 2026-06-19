import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DeliveryStatus } from '@webhook-hub/shared';

@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id: string;
    source: string;
    type: string;
    data: unknown;
    idempotencyKey: string;
    status: DeliveryStatus;
  }) {
    return this.prisma.webhookEvent.create({
      data: {
        id: data.id,
        source: data.source,
        type: data.type,
        data: data.data as any,
        idempotencyKey: data.idempotencyKey,
        status: data.status as any,
      },
    });
  }

  async findByIdempotencyKey(key: string) {
    return this.prisma.webhookEvent.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async findById(id: string, limit = 100, offset = 0) {
    return this.prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        deliveryAttempts: {
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        },
      },
    });
  }

  async updateStatus(id: string, status: DeliveryStatus) {
    return this.prisma.webhookEvent.update({
      where: { id },
      data: { status: status as any },
    });
  }
}