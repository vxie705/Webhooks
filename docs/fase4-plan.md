# Implementation Plan — Fase 4: Observabilidad (Stack Completo)

> **Objetivo:** Implementar observabilidad completa: Prometheus + Grafana + OpenTelemetry + dashboards + alertas
> **Enfoque:** Clean code, código legible, revisión doble antes de implementar

---

## [Overview]

Implementar el stack completo de observabilidad para Webhook Hub, cubriendo métricas (Prometheus), dashboards (Grafana), tracing distribuido (OpenTelemetry), logging estructurado (Pino) y alertas automatizadas.

Actualmente el sistema tiene `MetricsService` duplicado en ingestor y worker con prom-client, y `PinoLoggerService` solo en ingestor. Falta: endpoint `/metrics` expuesto, servicios Prometheus/Grafana en docker-compose, dashboard pre-configurado, OpenTelemetry tracing para rastrear requests de extremo a extremo (Ingestor → Redis → Worker → Destino), QueueMonitorService para monitorear lag de cola, y logger configurado en el worker.

---

## [Types]

Se agregarán tipos compartidos para trazas OpenTelemetry y configuración de dashboards.

### Interfaces nuevas en `packages/shared/src/interfaces/`:

```typescript
// trace.interface.ts
export interface ITraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'INTERNAL' | 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';
  status: 'OK' | 'ERROR';
  startTime: [number, number]; // seconds, nanoseconds
  endTime: [number, number];
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: [number, number]; attributes?: Record<string, unknown> }>;
}

// alert.interface.ts
export interface IAlertRule {
  name: string;
  metric: string;
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  duration: string; // e.g. "5m"
  severity: 'warning' | 'critical' | 'info';
  description: string;
}
```

### Enumeraciones nuevas:

```typescript
// metric-names.enum.ts
export enum MetricNames {
  DELIVERY_TOTAL = 'webhook_delivery_total',
  DELIVERY_LATENCY_MS = 'webhook_delivery_latency_ms',
  QUEUE_LAG = 'webhook_queue_lag',
  ERROR_TOTAL = 'webhook_error_total',
  CIRCUIT_BREAKER_STATE = 'circuit_breaker_state',
  ACTIVE_JOBS = 'webhook_active_jobs',
  WORKER_POOL_SIZE = 'webhook_worker_pool_size',
}
```

---

## [Files]

Se crearán 12 archivos nuevos y se modificarán 8 archivos existentes.

### Archivos nuevos:

| # | Ruta | Propósito |
|---|------|-----------|
| 1 | `packages/shared/src/enums/metric-names.enum.ts` | Nombres de métricas centralizados |
| 2 | `packages/shared/src/interfaces/trace.interface.ts` | Interfaces para spans OTEL |
| 3 | `packages/shared/src/interfaces/alert.interface.ts` | Interfaces para reglas de alerta |
| 4 | `apps/ingestor/src/common/metrics/metrics.controller.ts` | Endpoint GET /metrics para Prometheus scrape |
| 5 | `apps/ingestor/src/common/metrics/metrics.module.ts` | Módulo NestJS para métricas |
| 6 | `apps/worker/src/common/metrics/metrics.module.ts` | Módulo NestJS para métricas del worker |
| 7 | `apps/worker/src/common/logger/pino-logger.service.ts` | Logger Pino para worker (idéntico al de ingestor) |
| 8 | `apps/worker/src/common/otel/opentelemetry.service.ts` | Servicio OTEL para tracing en worker |
| 9 | `apps/ingestor/src/common/otel/opentelemetry.service.ts` | Servicio OTEL para tracing en ingestor |
| 10 | `apps/worker/src/common/queue-monitor/queue-monitor.service.ts` | Monitoreo de lag de cola BullMQ |
| 11 | `apps/worker/src/common/queue-monitor/queue-monitor.module.ts` | Módulo NestJS para queue monitor |
| 12 | `infra/grafana/dashboards/webhook-hub.json` | Dashboard Grafana pre-configurado |
| 13 | `infra/prometheus/prometheus.yml` | Configuración de Prometheus |
| 14 | `infra/grafana/provisioning/datasources/datasources.yml` | Datasource Prometheus auto-configurado |
| 15 | `infra/grafana/provisioning/dashboards/dashboards.yml` | Provisioning de dashboards auto-configurado |

### Archivos a modificar:

| # | Ruta | Cambio |
|---|------|--------|
| 1 | `infra/docker/docker-compose.yml` | Agregar servicios Prometheus + Grafana |
| 2 | `apps/ingestor/src/app.module.ts` | Importar MetricsModule, OtelModule |
| 3 | `apps/ingestor/src/main.ts` | Inicializar OTEL SDK, agregar endpoint /metrics |
| 4 | `apps/worker/src/app.module.ts` | Importar MetricsModule, QueueMonitorModule, PinoLogger |
| 5 | `apps/worker/src/main.ts` | Inicializar OTEL SDK, logger |
| 6 | `apps/ingestor/package.json` | Agregar @opentelemetry/*, @nestjs/terminus |
| 7 | `apps/worker/package.json` | Agregar @opentelemetry/*, pino |
| 8 | `.env.example` | Agregar variables OTEL_EXPORTER_OTLP_ENDPOINT, PROMETHEUS_PORT |

---

## [Functions]

### Nuevas funciones:

| Función | Archivo | Firma | Propósito |
|---------|---------|-------|-----------|
| `getMetrics()` | `metrics.controller.ts` | `async getMetrics(): Promise<string>` | Endpoint GET /metrics que retorna métricas en formato Prometheus |
| `startSpan()` | `opentelemetry.service.ts` | `startSpan(name: string, attrs?: Record<string, unknown>): Span` | Iniciar un span de tracing |
| `endSpan()` | `opentelemetry.service.ts` | `endSpan(span: Span, status?: 'OK' \| 'ERROR'): void` | Finalizar un span |
| `recordException()` | `opentelemetry.service.ts` | `recordException(span: Span, error: Error): void` | Registrar excepción en un span |
| `checkQueueLag()` | `queue-monitor.service.ts` | `async checkQueueLag(): Promise<number>` | Consultar el job más antiguo y calcular lag |
| `setupOtelSdk()` | `main.ts` (ingestor + worker) | `setupOtelSdk(): void` | Inicializar OpenTelemetry NodeSDK |

### Funciones modificadas:

| Función | Archivo | Cambio |
|---------|---------|--------|
| `bootstrap()` | `apps/ingestor/src/main.ts` | Agregar `setupOtelSdk()`, registrar MetricsController |
| `bootstrap()` | `apps/worker/src/main.ts` | Agregar `setupOtelSdk()`, PinoLogger |
| `process()` | `webhook.worker.ts` | Agregar tracing spans alrededor de delivery |
| `process()` | `delivery.service.ts` | Agregar tracing spans alrededor de HTTP call |
| `ingest()` | `webhook.controller.ts` | Agregar tracing spans alrededor de la ingesta |

---

## [Classes]

### Nuevas clases:

| Clase | Archivo | Métodos clave | Propósito |
|-------|---------|---------------|-----------|
| `MetricsController` | `apps/ingestor/src/common/metrics/metrics.controller.ts` | `getMetrics()` | Endpoint GET /metrics |
| `MetricsModule` | `apps/ingestor/src/common/metrics/metrics.module.ts` | — | Módulo NestJS que exporta MetricsService + MetricsController |
| `MetricsModule` | `apps/worker/src/common/metrics/metrics.module.ts` | — | Módulo NestJS que exporta MetricsService |
| `PinoLoggerService` | `apps/worker/src/common/logger/pino-logger.service.ts` | `log()`, `error()`, `warn()`, `debug()`, `verbose()` | Logger Pino para worker |
| `OpenTelemetryService` | `apps/ingestor/src/common/otel/opentelemetry.service.ts` | `startSpan()`, `endSpan()`, `recordException()` | Tracing OTEL en ingestor |
| `OpenTelemetryService` | `apps/worker/src/common/otel/opentelemetry.service.ts` | `startSpan()`, `endSpan()`, `recordException()` | Tracing OTEL en worker |
| `QueueMonitorService` | `apps/worker/src/common/queue-monitor/queue-monitor.service.ts` | `checkQueueLag()`, `onModuleInit()` | Monitoreo periódico de lag de cola |
| `QueueMonitorModule` | `apps/worker/src/common/queue-monitor/queue-monitor.module.ts` | — | Módulo NestJS para QueueMonitorService |

### Clases modificadas:

| Clase | Archivo | Cambio |
|-------|---------|--------|
| `AppModule` (ingestor) | `apps/ingestor/src/app.module.ts` | Importar MetricsModule |
| `AppModule` (worker) | `apps/worker/src/app.module.ts` | Importar MetricsModule, QueueMonitorModule, PinoLoggerService |
| `WebhookWorker` | `apps/worker/src/worker/webhook.worker.ts` | Inyectar OpenTelemetryService, agregar spans |
| `DeliveryService` | `apps/worker/src/delivery/delivery.service.ts` | Inyectar OpenTelemetryService, agregar spans |
| `WebhookController` | `apps/ingestor/src/webhook/webhook.controller.ts` | Inyectar OpenTelemetryService, agregar spans |

---

## [Dependencies]

### Nuevas dependencias (root + apps):

| Paquete | Versión | Ámbito | Propósito |
|---------|---------|--------|-----------|
| `@opentelemetry/api` | ^1.8.0 | root | API de OpenTelemetry |
| `@opentelemetry/sdk-node` | ^0.52.0 | root | SDK Node.js para OTEL |
| `@opentelemetry/auto-instrumentations-node` | ^0.44.0 | root | Instrumentación automática |
| `@opentelemetry/exporter-otlp-grpc` | ^0.52.0 | root | Exporter OTLP via gRPC |
| `@opentelemetry/sdk-metrics` | ^1.25.0 | root | SDK de métricas OTEL |
| `@opentelemetry/sdk-trace-base` | ^1.25.0 | root | SDK de tracing OTEL |
| `@opentelemetry/instrumentation-http` | ^0.52.0 | root | Instrumentación HTTP |
| `@opentelemetry/instrumentation-express` | ^0.41.0 | root | Instrumentación Express |
| `@opentelemetry/instrumentation-bullmq` | ^0.1.0 | root | Instrumentación BullMQ |
| `@opentelemetry/instrumentation-pino` | ^0.40.0 | root | Instrumentación Pino |
| `pino` | ^8.19.0 | worker | Logger estructurado (ya en ingestor) |

### Servicios Docker nuevos:

| Servicio | Imagen | Puerto | Propósito |
|----------|--------|--------|-----------|
| `prometheus` | prom/prometheus:latest | 9090 | Scrape de métricas |
| `grafana` | grafana/grafana:latest | 3000 | Dashboards visuales |

---

## [Testing]

Se crearán tests unitarios para todos los servicios nuevos y se actualizarán los existentes.

### Tests nuevos:

| Archivo | Tests | Cobertura |
|---------|-------|-----------|
| `apps/ingestor/tests/metrics.controller.test.ts` | 3 | GET /metrics retorna string, status 200, register.metrics() |
| `apps/worker/tests/queue-monitor.service.test.ts` | 4 | checkQueueLag con/sin jobs, setQueueLag, error handling |
| `apps/worker/tests/pino-logger.service.test.ts` | 3 | log, error, debug methods |
| `packages/shared/tests/metric-names.test.ts` | 1 | MetricNames enum values |

### Tests modificados:

| Archivo | Cambio |
|---------|--------|
| `apps/worker/tests/webhook.worker.test.ts` | Mock OpenTelemetryService |
| `apps/worker/tests/delivery.service.test.ts` | Mock OpenTelemetryService |

---

## [Implementation Order]

La implementación se realizará en 7 pasos secuenciales para minimizar conflictos y asegurar integración correcta.

1. **Paso 1: Dependencias y configuración base** — Instalar paquetes OTEL, actualizar package.json de ingestor y worker, actualizar .env.example
2. **Paso 2: Tipos compartidos** — Crear metric-names.enum.ts, trace.interface.ts, alert.interface.ts en shared package
3. **Paso 3: Logger en worker + MetricsModule** — Crear PinoLoggerService en worker, MetricsModule en ambos apps, MetricsController en ingestor
4. **Paso 4: OpenTelemetry SDK + servicios** — Crear OpenTelemetryService en ingestor y worker, setupOtelSdk() en main.ts de ambos
5. **Paso 5: QueueMonitorService** — Crear QueueMonitorService + QueueMonitorModule en worker, integrar con MetricsService
6. **Paso 6: Docker Compose + infra** — Agregar Prometheus + Grafana a docker-compose.yml, crear prometheus.yml, dashboards JSON, provisioning
7. **Paso 7: Tests + README** — Tests unitarios para todo lo nuevo, actualizar README.md con sección de observabilidad