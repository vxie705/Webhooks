import { MetricNames } from '../src/enums/metric-names.enum';

describe('MetricNames Enum', () => {
  it('should define all required metric names', () => {
    expect(MetricNames.DELIVERY_TOTAL).toBe('webhook_delivery_total');
    expect(MetricNames.DELIVERY_LATENCY_MS).toBe('webhook_delivery_latency_ms');
    expect(MetricNames.QUEUE_LAG).toBe('webhook_queue_lag');
    expect(MetricNames.ERROR_TOTAL).toBe('webhook_error_total');
    expect(MetricNames.CIRCUIT_BREAKER_STATE).toBe('circuit_breaker_state');
    expect(MetricNames.ACTIVE_JOBS).toBe('webhook_active_jobs');
    expect(MetricNames.WORKER_POOL_SIZE).toBe('webhook_worker_pool_size');
  });
});