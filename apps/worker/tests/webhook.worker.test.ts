import { WebhookWorker } from '../src/worker/webhook.worker';
import { DeliveryService } from '../src/delivery/delivery.service';
import { MetricsService } from '../src/common/metrics/metrics.service';
import { DeliveryAttemptRepository } from '@webhook-hub/database';
import { DeliveryStatus } from '@webhook-hub/shared';

describe('WebhookWorker', () => {
  let worker: WebhookWorker;
  let mockDeliveryService: jest.Mocked<DeliveryService>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockRepo: jest.Mocked<DeliveryAttemptRepository>;

  const mockJob = {
    data: {
      id: 'evt-123',
      source: 'dest-456',
      type: 'test.event',
      data: {},
      timestamp: new Date().toISOString(),
      idempotencyKey: 'idemp-123',
    },
    updateProgress: jest.fn(),
  } as any;

  beforeEach(async () => {
    mockDeliveryService = {
      process: jest.fn(),
    } as any;
    mockMetricsService = {
      recordDeliveryLatency: jest.fn(),
      incrementDeliveryCounter: jest.fn(),
      incrementErrorCount: jest.fn(),
    } as any;
    mockRepo = { create: jest.fn() } as any;

    // Instantiate manually to avoid WorkerHost constructor interference with NestJS DI
    worker = new WebhookWorker(mockDeliveryService, mockMetricsService, mockRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process()', () => {
    it('should process job successfully', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: DeliveryStatus.DELIVERED,
        attempt: 1,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockDeliveryService.process).toHaveBeenCalledWith(mockJob.data);
      expect(mockMetricsService.recordDeliveryLatency).toHaveBeenCalled();
      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        DeliveryStatus.DELIVERED,
        'dest-456',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log retry status without updating progress', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: DeliveryStatus.RETRYING,
        attempt: 2,
        latencyMs: 50,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        DeliveryStatus.RETRYING,
        'dest-456',
      );
      expect(mockJob.updateProgress).not.toHaveBeenCalled();
    });

    it('should handle errors and increment error metric', async () => {
      mockDeliveryService.process.mockRejectedValue(new Error('Processing failed'));

      await expect(worker.process(mockJob)).rejects.toThrow('Processing failed');

      expect(mockMetricsService.incrementErrorCount).toHaveBeenCalledWith(
        'worker_error',
        'dest-456',
      );
    });

    it('should handle DEAD_LETTER status and update progress', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: DeliveryStatus.DEAD_LETTER,
        attempt: 6,
        latencyMs: 200,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        DeliveryStatus.DEAD_LETTER,
        'dest-456',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle FAILED status and update progress', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: DeliveryStatus.FAILED,
        attempt: 1,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        DeliveryStatus.FAILED,
        'dest-456',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should record delivery latency metric', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: DeliveryStatus.DELIVERED,
        attempt: 1,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockMetricsService.recordDeliveryLatency).toHaveBeenCalledWith(
        expect.any(Number),
        'dest-456',
      );
    });
  });
});