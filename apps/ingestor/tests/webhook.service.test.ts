import { WebhookService } from '../src/webhook/webhook.service';
import { EventRepository } from '@webhook-hub/database';
import { IWebhookEvent, DeliveryStatus } from '@webhook-hub/shared';

describe('WebhookService', () => {
  let service: WebhookService;
  let mockQueue: any;
  let mockEventRepository: jest.Mocked<EventRepository>;

  const mockEvent: IWebhookEvent = {
    id: 'evt-123',
    source: 'dest-456',
    type: 'test.event',
    data: { key: 'value' },
    timestamp: new Date().toISOString(),
    idempotencyKey: 'idemp-123',
  };

  beforeEach(() => {
    mockQueue = {
      add: jest.fn(),
    };
    mockEventRepository = {
      create: jest.fn(),
    } as any;

    service = new WebhookService(mockQueue as any, mockEventRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue()', () => {
    it('should add event to queue with idempotencyKey as jobId', async () => {
      mockQueue.add.mockResolvedValue({ id: 'bull-job-123' });

      const result = await service.enqueue(mockEvent);

      expect(mockQueue.add).toHaveBeenCalledWith('process-webhook', mockEvent, {
        jobId: mockEvent.idempotencyKey,
        removeOnComplete: true,
        removeOnFail: false,
      });
      expect(result.id).toBe('bull-job-123');
    });

    it('should return the job id from BullMQ', async () => {
      mockQueue.add.mockResolvedValue({ id: 'bull-job-456' });

      const result = await service.enqueue(mockEvent);

      expect(result.id).toBe('bull-job-456');
    });

    it('should propagate error when queue fails', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.enqueue(mockEvent)).rejects.toThrow('Redis connection failed');
    });
  });

  describe('persistEvent()', () => {
    it('should persist event with PENDING status', async () => {
      await service.persistEvent(mockEvent);

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        id: mockEvent.id,
        source: mockEvent.source,
        type: mockEvent.type,
        data: mockEvent.data,
        idempotencyKey: mockEvent.idempotencyKey,
        status: DeliveryStatus.PENDING,
      });
    });

    it('should propagate error when persistence fails', async () => {
      mockEventRepository.create.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.persistEvent(mockEvent)).rejects.toThrow('DB connection failed');
    });
  });
});