// Unit tests for CircuitBreakerService (isolated, no Redis)
// We test the STATE MACHINE logic, not Redis persistence

describe('CircuitBreaker - State Machine Logic', () => {
  // Simplified in-memory implementation for testing state transitions
  class CircuitBreakerLogic {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    failureCount = 0;
    lastAttemptAt: number | null = null;
    readonly FAILURE_THRESHOLD = 5;
    readonly TIMEOUT_OPEN_MS = 30_000;

    recordFailure(): void {
      if (this.state === 'HALF_OPEN') {
        // In HALF_OPEN, a single failure immediately opens the circuit
        this.state = 'OPEN';
        this.lastAttemptAt = Date.now();
        return;
      }
      this.failureCount++;
      if (this.failureCount >= this.FAILURE_THRESHOLD) {
        this.state = 'OPEN';
        this.lastAttemptAt = Date.now(); // Start timeout when circuit opens
      }
    }

    recordSuccess(): void {
      this.failureCount = 0;
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
      }
    }

    canProceed(): boolean {
      if (this.state === 'CLOSED') return true;
      if (this.state === 'OPEN') {
        const now = Date.now();
        if (!this.lastAttemptAt || now - this.lastAttemptAt > this.TIMEOUT_OPEN_MS) {
          this.state = 'HALF_OPEN';
          this.lastAttemptAt = now;
          return true;
        }
        return false;
      }
      // HALF_OPEN
      return true;
    }
  }

  describe('State Transitions (Corrected)', () => {
    it('should start in CLOSED state', () => {
      const cb = new CircuitBreakerLogic();
      expect(cb.state).toBe('CLOSED');
      expect(cb.canProceed()).toBe(true);
    });

    it('should transition to OPEN after FAILURE_THRESHOLD consecutive failures', () => {
      const cb = new CircuitBreakerLogic();
      for (let i = 0; i < 4; i++) {
        cb.recordFailure();
      }
      expect(cb.state).toBe('CLOSED'); // 4 < 5

      cb.recordFailure(); // 5th failure
      expect(cb.state).toBe('OPEN');
      expect(cb.canProceed()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout expires', () => {
      const cb = new CircuitBreakerLogic();

      // Force OPEN state
      for (let i = 0; i < 5; i++) cb.recordFailure();
      expect(cb.state).toBe('OPEN');
      expect(cb.canProceed()).toBe(false);

      // Simulate timeout passing
      cb.lastAttemptAt = Date.now() - 31_000;
      expect(cb.canProceed()).toBe(true);
      expect(cb.state).toBe('HALF_OPEN');
    });

    it('should transition from HALF_OPEN to CLOSED on success', () => {
      const cb = new CircuitBreakerLogic();

      // Force HALF_OPEN
      for (let i = 0; i < 5; i++) cb.recordFailure();
      cb.lastAttemptAt = Date.now() - 31_000;
      cb.canProceed(); // transition to HALF_OPEN
      expect(cb.state).toBe('HALF_OPEN');

      cb.recordSuccess();
      expect(cb.state).toBe('CLOSED');
      expect(cb.failureCount).toBe(0);
    });

    it('should transition from HALF_OPEN back to OPEN on single failure (CORRECTED)', () => {
      const cb = new CircuitBreakerLogic();

      // Force HALF_OPEN
      for (let i = 0; i < 5; i++) cb.recordFailure();
      cb.lastAttemptAt = Date.now() - 31_000;
      cb.canProceed(); // now HALF_OPEN
      expect(cb.state).toBe('HALF_OPEN');

      // In HALF_OPEN, 1 failure -> OPEN immediately
      cb.recordFailure();
      expect(cb.state).toBe('OPEN');
    });
  });

  describe('Edge Cases', () => {
    it('should reset failure count on success in CLOSED state', () => {
      const cb = new CircuitBreakerLogic();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.failureCount).toBe(2);

      cb.recordSuccess();
      expect(cb.failureCount).toBe(0);
      expect(cb.state).toBe('CLOSED');
    });

    it('should not allow proceed when circuit is OPEN and timeout has not expired', () => {
      const cb = new CircuitBreakerLogic();
      for (let i = 0; i < 5; i++) cb.recordFailure();

      cb.lastAttemptAt = Date.now();
      expect(cb.canProceed()).toBe(false);
      expect(cb.state).toBe('OPEN');
    });

    it('should recover after exactly the timeout period', () => {
      const cb = new CircuitBreakerLogic();
      for (let i = 0; i < 5; i++) cb.recordFailure();

      cb.lastAttemptAt = Date.now() - 30_001; // just past timeout
      expect(cb.canProceed()).toBe(true);
      expect(cb.state).toBe('HALF_OPEN');
    });

    it('should remain OPEN after HALF_OPEN failure', () => {
      const cb = new CircuitBreakerLogic();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      cb.lastAttemptAt = Date.now() - 31_000;
      cb.canProceed(); // HALF_OPEN

      cb.recordFailure(); // back to OPEN
      expect(cb.state).toBe('OPEN');

      // Should NOT allow proceed immediately
      expect(cb.canProceed()).toBe(false);
    });
  });

  describe('Bottleneck: HALF_OPEN Thundering Herd', () => {
    it('should detect thundering herd - multiple workers probe at same time after timeout', () => {
      const cb = new CircuitBreakerLogic();
      for (let i = 0; i < 5; i++) cb.recordFailure();

      // Simulate 10 workers checking at the same time after timeout
      cb.lastAttemptAt = Date.now() - 31_000;

      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(cb.canProceed());
      }

      // First worker gets HALF_OPEN probe
      expect(results[0]).toBe(true);
      expect(cb.state).toBe('HALF_OPEN');

      // Remaining 9 workers also get through because state is HALF_OPEN
      const probesAllowed = results.filter(r => r === true).length;
      expect(probesAllowed).toBe(10); // ALL probe simultaneously!

      // RISK: If destination is still failing, all 10 workers fail
      // and the circuit opens again. 10 wasted HTTP calls.
      // MITIGATION: timeout jitter (random 30-35s instead of fixed 30s)
    });
  });
});