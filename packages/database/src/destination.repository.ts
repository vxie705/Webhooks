import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CircuitBreakerState } from '@webhook-hub/shared';

@Injectable()
export class DestinationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByApiKey(apiKey: string) {
    return this.prisma.destination.findUnique({
      where: { apiKey },
    });
  }

  async findById(id: string) {
    return this.prisma.destination.findUnique({
      where: { id },
    });
  }

  async findAll() {
    return this.prisma.destination.findMany({
      where: { isActive: true },
    });
  }

  async updateCircuitState(id: string, state: CircuitBreakerState, failureCount: number) {
    return this.prisma.destination.update({
      where: { id },
      data: {
        circuitState: state,
        failureCount,
        lastFailureAt: state === CircuitBreakerState.OPEN ? new Date() : undefined,
      },
    });
  }

  async incrementFailureCount(id: string) {
    return this.prisma.destination.update({
      where: { id },
      data: {
        failureCount: { increment: 1 },
        lastFailureAt: new Date(),
      },
    });
  }

  async resetFailureCount(id: string) {
    return this.prisma.destination.update({
      where: { id },
      data: {
        failureCount: 0,
        circuitState: CircuitBreakerState.CLOSED,
      },
    });
  }
}