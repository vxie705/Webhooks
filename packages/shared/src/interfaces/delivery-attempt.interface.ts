import { DeliveryStatus } from '../enums/delivery-status.enum';

export interface IDeliveryAttempt {
  id: string;
  eventId: string;
  attempt: number;
  status: DeliveryStatus;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
  workerId: string;
  createdAt: string;
}