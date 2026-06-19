import { IDeliveryResultDto } from '../src/dto/delivery-result.dto';
import { DeliveryStatus } from '../src/enums/delivery-status.enum';

describe('IDeliveryResultDto', () => {
  it('should create a valid delivery result with all fields', () => {
    const result: IDeliveryResultDto = {
      eventId: 'evt-123',
      status: DeliveryStatus.DELIVERED,
      httpStatus: 200,
      attempt: 1,
      latencyMs: 150,
      timestamp: new Date().toISOString(),
    };

    expect(result.eventId).toBe('evt-123');
    expect(result.status).toBe(DeliveryStatus.DELIVERED);
    expect(result.httpStatus).toBe(200);
    expect(result.attempt).toBe(1);
    expect(result.latencyMs).toBe(150);
    expect(result.timestamp).toBeDefined();
  });

  it('should create a delivery result with error', () => {
    const result: IDeliveryResultDto = {
      eventId: 'evt-456',
      status: DeliveryStatus.FAILED,
      attempt: 3,
      latencyMs: 5000,
      error: 'Connection timeout',
      timestamp: new Date().toISOString(),
    };

    expect(result.status).toBe(DeliveryStatus.FAILED);
    expect(result.error).toBe('Connection timeout');
    expect(result.httpStatus).toBeUndefined();
  });

  it('should create a delivery result without optional httpStatus', () => {
    const result: IDeliveryResultDto = {
      eventId: 'evt-789',
      status: DeliveryStatus.RETRYING,
      attempt: 2,
      latencyMs: 1000,
      timestamp: new Date().toISOString(),
    };

    expect(result.httpStatus).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});