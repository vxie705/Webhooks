import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '@webhook-hub/database';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
    } as any;

    controller = new HealthController(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check()', () => {
    it('should return status ok with uptime and version', async () => {
      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBe('1.0.0');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('live()', () => {
    it('should return status ok with uptime', async () => {
      const result = await controller.live();

      expect(result.status).toBe('ok');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });
  });
});