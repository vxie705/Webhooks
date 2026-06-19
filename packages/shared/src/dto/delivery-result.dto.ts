import { DeliveryStatus } from '../enums/delivery-status.enum';

export interface IDeliveryResultDto {
  eventId: string;
  status: DeliveryStatus;
  httpStatus?: number;
  attempt: number;
  latencyMs: number;
  error?: string;
  timestamp: string;
}