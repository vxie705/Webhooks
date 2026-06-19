import { CircuitBreakerState } from '../enums/circuit-breaker-state.enum';

export interface ICircuitBreakerState {
  destinationId: string;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: string | null;
  lastAttemptAt: string | null;
}