import { register } from 'prom-client';

describe('MetricsController', () => {
  let MetricsController: any;

  beforeAll(async () => {
    const module = await import('../src/common/metrics/metrics.controller');
    MetricsController = module.MetricsController;
  });

  it('should return a string from register.metrics()', async () => {
    const controller = new MetricsController();
    const result = await controller.getMetrics();
    expect(typeof result).toBe('string');
  });

  it('should return truthy response', async () => {
    const controller = new MetricsController();
    const result = await controller.getMetrics();
    expect(result).toBeDefined();
  });

  it('should call register.metrics()', async () => {
    const spy = jest.spyOn(register, 'metrics');
    const controller = new MetricsController();
    await controller.getMetrics();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
