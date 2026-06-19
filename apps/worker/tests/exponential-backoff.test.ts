import { ExponentialBackoff } from '../src/retry/exponential-backoff';

describe('ExponentialBackoff - Edge Cases', () => {
  describe('getDelayMs', () => {
    it('should return baseDelay for attempt 1', () => {
      const delay = ExponentialBackoff.getDelayMs(1, 1000, 60000);
      // 1000 * 2^0 = 1000 + jitter (0-100)
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(1100);
    });

    it('should double each attempt (attempt 2 = 2000ms base)', () => {
      const delay = ExponentialBackoff.getDelayMs(2, 1000, 60000);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2200);
    });

    it('should cap at maxDelayMs', () => {
      const delay = ExponentialBackoff.getDelayMs(10, 1000, 60000);
      // 1000 * 2^9 = 512000, capped at 60000
      expect(delay).toBeLessThan(66000); // 60000 + 10% jitter
      expect(delay).toBeGreaterThanOrEqual(60000);
    });

    it('should handle attempt 0 gracefully', () => {
      const delay = ExponentialBackoff.getDelayMs(0, 1000, 60000);
      // 1000 * 2^-1 = 500ms + jitter
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(550);
    });

    it('should always add jitter (randomness)', () => {
      const delays = new Set<number>();
      for (let i = 0; i < 100; i++) {
        delays.add(ExponentialBackoff.getDelayMs(1, 1000, 60000));
      }
      // With jitter, we should see at least 2 different values
      expect(delays.size).toBeGreaterThan(1);
    });

    it('jitter should never exceed 10%', () => {
      for (let i = 0; i < 1000; i++) {
        const delay = ExponentialBackoff.getDelayMs(1, 1000, 60000);
        const jitterRatio = (delay - 1000) / 1000;
        expect(jitterRatio).toBeLessThanOrEqual(0.1);
        expect(jitterRatio).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('shouldRetry', () => {
    it('should return true for attempt <= maxRetries', () => {
      expect(ExponentialBackoff.shouldRetry(1)).toBe(true);
      expect(ExponentialBackoff.shouldRetry(5)).toBe(true);
    });

    it('should return false for attempt > maxRetries', () => {
      expect(ExponentialBackoff.shouldRetry(6)).toBe(false);
      expect(ExponentialBackoff.shouldRetry(10)).toBe(false);
    });

    it('should handle attempt 0 (edge case - should return true)', () => {
      expect(ExponentialBackoff.shouldRetry(0)).toBe(true);
    });

    it('should respect custom maxRetries', () => {
      expect(ExponentialBackoff.shouldRetry(3, 3)).toBe(true);
      expect(ExponentialBackoff.shouldRetry(4, 3)).toBe(false);
    });
  });

  describe('Bottleneck Analysis - Thundering Herd', () => {
    it('multiple retries with same attempt should have different delays (jitter prevents thundering herd)', () => {
      const delays = Array.from({ length: 50 }, () =>
        ExponentialBackoff.getDelayMs(5, 1000, 60000),
      );
      const unique = new Set(delays);
      // Jitter ensures variety, reducing thundering herd probability
      expect(unique.size).toBeGreaterThan(1);
    });

    it('delays should be monotonically increasing across attempts', () => {
      const delays = [1, 2, 3, 4, 5].map(a =>
        ExponentialBackoff.getDelayMs(a, 1000, 60000),
      );
      for (let i = 1; i < delays.length; i++) {
        // With jitter, attempt N should always be >= attempt N-1 base
        const minBase = 1000 * Math.pow(2, i);
        const prevMax = 1000 * Math.pow(2, i - 1) * 1.1;
        expect(delays[i]).toBeGreaterThan(prevMax);
      }
    });
  });
});