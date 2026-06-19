import { DeliveryStatus } from '../src/enums/delivery-status.enum';
import { CircuitBreakerState } from '../src/enums/circuit-breaker-state.enum';

describe('DeliveryStatus', () => {
  it('should have all expected statuses', () => {
    expect(DeliveryStatus.PENDING).toBe('pending');
    expect(DeliveryStatus.DELIVERED).toBe('delivered');
    expect(DeliveryStatus.FAILED).toBe('failed');
    expect(DeliveryStatus.RETRYING).toBe('retrying');
    expect(DeliveryStatus.DEAD_LETTER).toBe('dead_letter');
  });

  it('should have exactly 5 statuses', () => {
    const keys = Object.keys(DeliveryStatus).filter(k => isNaN(Number(k)));
    expect(keys).toHaveLength(5);
  });
});

describe('CircuitBreakerState', () => {
  it('should have all expected states', () => {
    expect(CircuitBreakerState.CLOSED).toBe('CLOSED');
    expect(CircuitBreakerState.OPEN).toBe('OPEN');
    expect(CircuitBreakerState.HALF_OPEN).toBe('HALF_OPEN');
  });

  it('should have exactly 3 states', () => {
    const keys = Object.keys(CircuitBreakerState).filter(k => isNaN(Number(k)));
    expect(keys).toHaveLength(3);
  });
});