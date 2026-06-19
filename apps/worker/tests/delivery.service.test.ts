import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryService } from '../src/delivery/delivery.service';
import { HttpClientService } from '../src/delivery/http-client.service';
import { CircuitBreakerService } from '../src/delivery/circuit-breaker/circuit-breaker.service';
import { RetryService } from '../src/retry/retry.service';
import { DeliveryAttemptRepository } from '@webhook-hub/database';
import { IWebhookEvent, DeliveryStatus } from '@webhook-hub/shared';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let mockHttpClient: jest.Mocked<HttpClientService>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreakerService>;
  let mockRetry: jest.Mocked<RetryService>;
  let mockRepo: jest.Mocked<DeliveryAttemptRepository>;

  const mockEvent: IWebhookEvent = {
    id: 'evt-123',
    source: 'dest-456',
    type: 'test.event',
    data: { key: 'value' },
    timestamp: new Date().toISOString(),
    idempotencyKey: 'idemp-123',
    attempt: 1,
  };

  beforeEach(async () => {
    mockHttpClient = {
      post: jest.fn(),
    } as any;
    mockCircuitBreaker = {
      canProceed: jest.fn(),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    } as any;
    mockRetry = {
      scheduleRetry: jest.fn(),
    } as any;
    mockRepo = {
      create: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: RetryService, useValue: mockRetry },
        { provide: DeliveryAttemptRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process()', () => {
    it('should deliver successfully when circuit is CLOSED', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
      expect(result.httpStatus).toBe(200);
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should fail when circuit is OPEN', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(false);

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.FAILED);
      expect(result.error).toContain('Circuit OPEN');
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should retry on 502 with retries available', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('502 Bad Gateway'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.RETRYING);
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
      expect(mockRetry.scheduleRetry).toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should dead letter on 502 when max retries reached', async () => {
      const eventWithMaxRetries = { ...mockEvent, attempt: 6 };
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('502 Bad Gateway'));

      const result = await service.process(eventWithMaxRetries);

      expect(result.status).toBe(DeliveryStatus.DEAD_LETTER);
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
      expect(mockRetry.scheduleRetry).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should handle network timeout', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.RETRYING);
      expect(result.error).toContain('timeout');
    });

    it('should persist delivery attempt even if HTTP fails', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('Connection refused'));

      await service.process(mockEvent);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: mockEvent.id,
          status: DeliveryStatus.RETRYING,
        }),
      );
    });

    it('should not throw if persistDeliveryAttempt fails', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });
      mockRepo.create.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
    });

    it('should include workerId in delivery attempt', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });

      await service.process(mockEvent);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: expect.any(String),
        }),
      );
    });
  });
});