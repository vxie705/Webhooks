const mockSetQueueLag = jest.fn();

jest.mock('../src/common/metrics/metrics.service', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    setQueueLag: mockSetQueueLag,
  })),
}));

describe('QueueMonitorService', () => {
  let QueueMonitorService: any;
  let MetricsService: any;

  beforeAll(async () => {
    const monitorModule = await import(
      '../src/common/queue-monitor/queue-monitor.service'
    );
    QueueMonitorService = monitorModule.QueueMonitorService;
    const metricsModule = await import('../src/common/metrics/metrics.service');
    MetricsService = metricsModule.MetricsService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set queue lag to 0 on checkQueueLag', async () => {
    const metrics = new MetricsService();
    const service = new QueueMonitorService(metrics);
    await service.checkQueueLag();
    expect(mockSetQueueLag).toHaveBeenCalledWith(0);
  });

  it('should call checkQueueLag on interval via onModuleInit', () => {
    const metrics = new MetricsService();
    const service = new QueueMonitorService(metrics);
    service.onModuleInit();
    jest.advanceTimersByTime(10_000);
    expect(mockSetQueueLag).toHaveBeenCalled();
  });

  it('should handle errors gracefully in checkQueueLag', async () => {
    mockSetQueueLag.mockImplementationOnce(() => {
      throw new Error('Redis connection failed');
    });
    const metrics = new MetricsService();
    const service = new QueueMonitorService(metrics);
    await expect(service.checkQueueLag()).resolves.toBeUndefined();
  });

  it('should export QueueMonitorService from module', async () => {
    const module = await import(
      '../src/common/queue-monitor/queue-monitor.module'
    );
    expect(module.QueueMonitorModule).toBeDefined();
    expect(module.QueueMonitorModule.prototype).toBeDefined();
  });
});