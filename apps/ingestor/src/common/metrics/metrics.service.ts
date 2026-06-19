import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly deliveryCounter: Counter<string>;
  private readonly deliveryLatency: Histogram<string>;
  private readonly queueLagGauge: Gauge<string>;
  private readonly errorRateCounter: Counter<string>;

  constructor() {
    // Limpiar métricas existentes para evitar conflictos con tests o reinicios
    register.clear();

    this.deliveryCounter = new Counter({
      name: 'webhook_delivery_total',
      help: 'Total de entregas por estado',
      labelNames: ['status', 'source'],
    });

    this.deliveryLatency = new Histogram({
      name: 'webhook_delivery_latency_ms',
      help: 'Latencia de entrega en ms',
      buckets: [10, 25, 50, 100, 200, 500, 1000, 2000],
      labelNames: ['source'],
    });

    this.queueLagGauge = new Gauge({
      name: 'webhook_queue_lag',
      help: 'Lag de la cola de webhooks en segundos',
      labelNames: ['queue'],
    });

    this.errorRateCounter = new Counter({
      name: 'webhook_error_total',
      help: 'Total de errores por tipo',
      labelNames: ['error_type', 'source'],
    });
  }

  recordDeliveryLatency(ms: number, source = 'unknown'): void {
    this.deliveryLatency.observe({ source }, ms);
  }

  incrementDeliveryCounter(status: string, source = 'unknown'): void {
    this.deliveryCounter.inc({ status, source });
  }

  setQueueLag(seconds: number, queue = 'webhooks'): void {
    this.queueLagGauge.set({ queue }, seconds);
  }

  incrementErrorCount(type: string, source = 'unknown'): void {
    this.errorRateCounter.inc({ error_type: type, source });
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}