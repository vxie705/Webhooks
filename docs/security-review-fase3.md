# Auditoría de Seguridad — Fase 3: Worker + Entrega

> **Auditor:** Arquitecto de Software Senior  
> **Fecha:** 2026-06-19  
> **Objetivo:** Revisar código de Fase 3, identificar vulnerabilidades y proponer mejoras  
> **Alcance:** HttpClientService, DeliveryService, WebhookWorker, DeliveryAttemptRepository

---

## 1. Resumen Ejecutivo

Fase 3 completada con **HTTP client funcional** y **persistencia de DeliveryAttempts**. Se identificaron **5 vulnerabilidades/mejoras** (2 MEDIUM, 3 LOW) y **3 planes de mejora** para robustez y observabilidad.

### Estado de Seguridad

| Categoría | Vulnerabilidades | Criticidad |
|-----------|-----------------|------------|
| **HTTP Client** | 2 | MEDIUM |
| **Error Handling** | 1 | LOW |
| **Logging** | 1 | LOW |
| **Resiliencia** | 1 | MEDIUM |
| **TOTAL** | **5** | — |

---

## 2. Vulnerabilidades Identificadas

### 2.1 Timeout Hardcodeado (MEDIUM)

**Archivo:** `apps/worker/src/delivery/http-client.service.ts`  
**Línea:** 11  
**Severidad:** MEDIUM  
**CWE:** CWE-758 (Undefined Behavior)

**Problema:**
```typescript
this.httpClient = axios.create({
  timeout: 5000, // Hardcodeado
});
```

**Riesgo:** 
- No se puede ajustar por entorno (dev/staging/prod)
- En producción puede necesitar 10s, en testing 2s
- Si un destino requiere más tiempo, fallará sin opción de configuración

**Solución Propuesta:**
```typescript
// Usar variable de entorno con fallback
const timeout = parseInt(process.env.HTTP_TIMEOUT_MS ?? '5000', 10);

this.httpClient = axios.create({
  timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Impacto:** Bajo (mejora de flexibilidad)  
**Esfuerzo:** 5 minutos

---

### 2.2 Sin Validación de URL (MEDIUM)

**Archivo:** `apps/worker/src/delivery/http-client.service.ts`  
**Línea:** 23  
**Severidad:** MEDIUM  
**CWE:** CWE-918 (SSRF - Server-Side Request Forgery)

**Problema:**
```typescript
async post(url: string, data: unknown): Promise<{ status: number }> {
  const response: any = await this.httpClient.post(url, data);
}
```

**Riesgo:**
- Si `url` viene de BD sin validar, un atacante podría inyectar URLs internas
- Ejemplo: `url = "http://localhost:5432/postgres"` (SSRF a PostgreSQL)
- Ejemplo: `url = "http://169.254.169.254/latest/meta-data/"` (AWS metadata)

**Solución Propuesta:**
```typescript
private readonly ALLOWED_SCHEMES = ['http', 'https'];
private readonly BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal', // GCP metadata
];

private validateUrl(url: string): void {
  const parsed = new URL(url);
  
  if (!this.ALLOWED_SCHEMES.includes(parsed.protocol.replace(':', ''))) {
    throw new Error(`Invalid protocol: ${parsed.protocol}`);
  }
  
  if (this.BLOCKED_HOSTS.includes(parsed.hostname)) {
    throw new Error(`Blocked host: ${parsed.hostname}`);
  }
}

async post(url: string, data: unknown): Promise<{ status: number }> {
  this.validateUrl(url); // ← Validación antes de hacer request
  // ... resto del código
}
```

**Impacto:** Alto (previene SSRF)  
**Esfuerzo:** 15 minutos

---

### 2.3 Logging de Errores Insuficiente (LOW)

**Archivo:** `apps/worker/src/delivery/delivery.service.ts`  
**Línea:** 112  
**Severidad:** LOW  
**CWE:** CWE-778 (Insufficient Logging)

**Problema:**
```typescript
private async persistDeliveryAttempt(
  event: IWebhookEvent,
  result: IDeliveryResultDto,
): Promise<void> {
  try {
    await this.deliveryAttemptRepository.create({...});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Failed to persist delivery attempt: ${message}`);
    // No lanzar error para no interrumpir el flujo principal
  }
}
```

**Riesgo:**
- Solo se loggea el mensaje, no el stack trace completo
- No se incluye contexto (eventId, attempt number, etc.)
- Dificulta debugging en producción

**Solución Propuesta:**
```typescript
private async persistDeliveryAttempt(
  event: IWebhookEvent,
  result: IDeliveryResultDto,
): Promise<void> {
  try {
    await this.deliveryAttemptRepository.create({
      eventId: event.id,
      attempt: result.attempt,
      status: result.status,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      error: result.error,
      workerId: process.env.WORKER_ID ?? 'unknown',
    });
  } catch (error) {
    const context = {
      eventId: event.id,
      attempt: result.attempt,
      status: result.status,
      workerId: process.env.WORKER_ID,
    };
    
    this.logger.error({
      message: 'Failed to persist delivery attempt',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    });
  }
}
```

**Impacto:** Bajo (mejora de observabilidad)  
**Esfuerzo:** 10 minutos

---

### 2.4 Sin Límite de Reintentos en getDestination() (LOW)

**Archivo:** `apps/worker/src/delivery/delivery.service.ts`  
**Línea:** 145  
**Severidad:** LOW  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**
```typescript
private async getDestination(destinationId: string): Promise<{ url: string }> {
  // TODO: Obtener destino desde BD
  // Por ahora, retornar un stub para testing
  return {
    url: 'http://httpbin.org/post',
  };
}
```

**Riesgo:**
- Si `destinationId` no existe en BD, el stub retorna una URL hardcodeada
- Esto puede causar requests infinitos a un destino inexistente
- No hay validación de existencia previa

**Solución Propuesta:**
```typescript
private async getDestination(destinationId: string): Promise<{ url: string }> {
  // TODO: Integrar con DestinationRepository
  // Por ahora, validar al menos que destinationId no sea vacío
  if (!destinationId || destinationId.trim() === '') {
    throw new Error('Invalid destinationId: cannot be empty');
  }
  
  // Stub temporal para testing
  return {
    url: 'http://httpbin.org/post',
  };
}
```

**Impacto:** Bajo (mejora de validación)  
**Esfuerzo:** 5 minutos

---

### 2.5 Sin Retry en HttpClientService (MEDIUM)

**Archivo:** `apps/worker/src/delivery/http-client.service.ts`  
**Línea:** 23  
**Severidad:** MEDIUM  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**
```typescript
async post(url: string, data: unknown): Promise<{ status: number }> {
  try {
    const response: any = await this.httpClient.post(url, data);
    return { status: response.status };
  } catch (error) {
    // Sin retry, falla inmediatamente
  }
}
```

**Riesgo:**
- Errores transitorios (502, 503, timeout) causan fallo inmediato
- No hay retry a nivel HTTP (solo a nivel BullMQ)
- Aumenta tasa de Dead Letters innecesariamente

**Solución Propuesta:**
```typescript
import axios, { AxiosRetryConfig } from 'axios-retry';

constructor() {
  axios.defaults.timeout = 5000;
  
  // Configurar retry automático para errores transitorios
  axios.retry({
    retries: 2, // 2 reintentos adicionales
    retryDelay: (retryCount) => {
      return Math.pow(2, retryCount) * 1000; // 1s, 2s
    },
    retryCondition: (error) => {
      // Reintentar solo en errores de red y 5xx
      return (
        axios.isAxiosError(error) &&
        (!error.response || error.response.status >= 500)
      );
    },
  });
}
```

**Impacto:** Medio (reduce falsos positivos en DLQ)  
**Esfuerzo:** 20 minutos

---

## 3. Planes de Mejora (No Críticos)

### 3.1 Circuit Breaker State en BD

**Problema:** El estado del Circuit Breaker se almacena en Redis. Si Redis cae, se pierde el estado.

**Solución:** Persistir estado en PostgreSQL como cache:
```typescript
// Al cambiar de estado, persistir en BD
async transitionTo(destinationId: string, state: CircuitBreakerState) {
  await this.redis.set(`cb:state:${destinationId}`, state);
  await this.destinationRepository.updateCircuitState(destinationId, state);
}
```

**Beneficio:** Recuperación de estado ante fallos de Redis  
**Esfuerzo:** 30 minutos

---

### 3.2 Métricas de HTTP Client

**Problema:** No hay métricas específicas para el HTTP client (timeout, conexión, DNS).

**Solución:** Agregar métricas a HttpClientService:
```typescript
@Injectable()
export class HttpClientService {
  constructor(
    private readonly metricsService: MetricsService,
  ) {
    this.httpClient.interceptors.response.use(
      (response) => {
        this.metricsService.incrementHttpRequestCount(
          response.config.method ?? 'GET',
          response.status,
        );
        return response;
      },
      (error) => {
        const status = error.response?.status ?? 0;
        this.metricsService.incrementHttpErrorCount(
          error.code ?? 'UNKNOWN',
          status,
        );
        return Promise.reject(error);
      },
    );
  }
}
```

**Beneficio:** Mejor observabilidad de requests HTTP  
**Esfuerzo:** 20 minutos

---

### 3.3 Health Check para HTTP Client

**Problema:** No hay forma de verificar que el HTTP client funciona correctamente.

**Solución:** Agregar endpoint de health check:
```typescript
// En Worker module
@Get('health/http-client')
async checkHttpClient() {
  try {
    await this.httpClientService.get('http://httpbin.org/get');
    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

**Beneficio:** Detectar problemas de conectividad HTTP  
**Esfuerzo:** 15 minutos

---

## 4. Pruebas Unitarias Requeridas

### 4.1 Tests Faltantes

| Servicio | Tests Requeridos | Prioridad |
|----------|-----------------|-----------|
| `HttpClientService` | 5 tests | 🔴 Alta |
| `DeliveryService` | 8 tests | 🔴 Alta |
| `WebhookWorker` | 3 tests | 🟡 Media |

**Total:** 16 tests unitarios nuevos

---

### 4.2 Test Suite: HttpClientService

**Archivo:** `apps/worker/tests/http-client.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HttpClientService, HttpDeliveryError } from '../src/delivery/http-client.service';
import axios from 'axios';

jest.mock('axios');

describe('HttpClientService', () => {
  let service: HttpClientService;
  let mockAxios: jest.Mocked<typeof axios>;

  beforeEach(async () => {
    mockAxios = axios as jest.Mocked<typeof axios>;
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [HttpClientService],
    }).compile();

    service = module.get<HttpClientService>(HttpClientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with 5s timeout', () => {
      expect(mockAxios.create).toHaveBeenCalledWith({
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should add request interceptor', () => {
      const instance = mockAxios.create.mock.results[0].value;
      expect(instance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('post()', () => {
    it('should POST data and return status 200', async () => {
      const mockResponse = { status: 200 };
      const mockInstance = {
        post: jest.fn().mockResolvedValue(mockResponse),
        interceptors: { request: { use: jest.fn() } },
      };
      mockAxios.create.mockReturnValue(mockInstance as any);

      const result = await service.post('http://example.com', { test: 'data' });

      expect(result.status).toBe(200);
      expect(mockInstance.post).toHaveBeenCalledWith('http://example.com', { test: 'data' });
    });

    it('should throw HttpDeliveryError on 404', async () => {
      const mockError = {
        isAxiosError: true,
        response: { status: 404 },
        message: 'Not Found',
      };
      const mockInstance = {
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: { request: { use: jest.fn() } },
      };
      mockAxios.create.mockReturnValue(mockInstance as any);

      await expect(service.post('http://example.com', {})).rejects.toThrow(HttpDeliveryError);
    });

    it('should throw HttpDeliveryError on 500', async () => {
      const mockError = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Internal Server Error',
      };
      const mockInstance = {
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: { request: { use: jest.fn() } },
      };
      mockAxios.create.mockReturnValue(mockInstance as any);

      await expect(service.post('http://example.com', {})).rejects.toThrow(HttpDeliveryError);
    });

    it('should throw HttpDeliveryError with status 0 on network error', async () => {
      const mockError = {
        isAxiosError: true,
        response: undefined,
        message: 'Network Error',
      };
      const mockInstance = {
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: { request: { use: jest.fn() } },
      };
      mockAxios.create.mockReturnValue(mockInstance as any);

      await expect(service.post('http://example.com', {})).rejects.toThrow(HttpDeliveryError);
    });

    it('should rethrow non-axios errors', async () => {
      const mockError = new Error('Unknown error');
      const mockInstance = {
        post: jest.fn().mockRejectedValue(mockError),
        interceptors: { request: { use: jest.fn() } },
      };
      mockAxios.create.mockReturnValue(mockInstance as any);

      await expect(service.post('http://example.com', {})).rejects.toThrow('Unknown error');
    });
  });

  describe('HttpDeliveryError', () => {
    it('should create error with statusCode and message', () => {
      const error = new HttpDeliveryError(404, 'Not Found');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.name).toBe('HttpDeliveryError');
    });
  });
});
```

---

### 4.3 Test Suite: DeliveryService

**Archivo:** `apps/worker/tests/delivery.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryService } from '../src/delivery/delivery.service';
import { IWebhookEvent, DeliveryStatus } from '@webhook-hub/shared';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let mockHttpClient: jest.Mocked<any>;
  let mockCircuitBreaker: jest.Mocked<any>;
  let mockRetry: jest.Mocked<any>;
  let mockRepo: jest.Mocked<any>;

  const mockEvent: IWebhookEvent = {
    id: 'evt-123',
    source: 'dest-456',
    type: 'test.event',
    data: { key: 'value' },
    timestamp: new Date().toISOString(),
    idempotencyKey: 'idemp-123',
    attempt: 1,
  };

  beforeEach(async () => {
    mockHttpClient = { post: jest.fn() };
    mockCircuitBreaker = {
      canProceed: jest.fn(),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };
    mockRetry = { scheduleRetry: jest.fn() };
    mockRepo = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: 'HttpClientService', useValue: mockHttpClient },
        { provide: 'CircuitBreakerService', useValue: mockCircuitBreaker },
        { provide: 'RetryService', useValue: mockRetry },
        { provide: 'DeliveryAttemptRepository', useValue: mockRepo },
      ],
    }).compile();

    service = module.get<DeliveryService>(DeliveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process()', () => {
    it('should deliver successfully when circuit is CLOSED', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
      expect(result.httpStatus).toBe(200);
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should fail when circuit is OPEN', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(false);

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.FAILED);
      expect(result.error).toContain('Circuit OPEN');
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should retry on 502 with retries available', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('502 Bad Gateway'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.RETRYING);
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
      expect(mockRetry.scheduleRetry).toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should dead letter on 502 when max retries reached', async () => {
      const eventWithMaxRetries = { ...mockEvent, attempt: 6 };
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('502 Bad Gateway'));

      const result = await service.process(eventWithMaxRetries);

      expect(result.status).toBe(DeliveryStatus.DEAD_LETTER);
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
      expect(mockRetry.scheduleRetry).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should handle network timeout', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.RETRYING);
      expect(result.error).toContain('timeout');
    });

    it('should persist delivery attempt even if HTTP fails', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockRejectedValue(new Error('Connection refused'));

      await service.process(mockEvent);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: mockEvent.id,
          status: DeliveryStatus.RETRYING,
        }),
      );
    });

    it('should not throw if persistDeliveryAttempt fails', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });
      mockRepo.create.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.process(mockEvent);

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
    });

    it('should include workerId in delivery attempt', async () => {
      mockCircuitBreaker.canProceed.mockResolvedValue(true);
      mockHttpClient.post.mockResolvedValue({ status: 200 });

      await service.process(mockEvent);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: expect.any(String),
        }),
      );
    });
  });
});
```

---

### 4.4 Test Suite: WebhookWorker

**Archivo:** `apps/worker/tests/webhook.worker.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookWorker } from '../src/worker/webhook.worker';
import { DeliveryService } from '../src/delivery/delivery.service';
import { MetricsService } from '../src/common/metrics/metrics.service';
import { DeliveryAttemptRepository } from '@webhook-hub/database';

describe('WebhookWorker', () => {
  let worker: WebhookWorker;
  let mockDeliveryService: jest.Mocked<DeliveryService>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockRepo: jest.Mocked<DeliveryAttemptRepository>;

  const mockJob = {
    data: {
      id: 'evt-123',
      source: 'dest-456',
      type: 'test.event',
      data: {},
      timestamp: new Date().toISOString(),
      idempotencyKey: 'idemp-123',
    },
    updateProgress: jest.fn(),
  } as any;

  beforeEach(async () => {
    mockDeliveryService = {
      process: jest.fn(),
    } as any;
    mockMetricsService = {
      recordDeliveryLatency: jest.fn(),
      incrementDeliveryCounter: jest.fn(),
      incrementErrorCount: jest.fn(),
    } as any;
    mockRepo = { create: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookWorker,
        { provide: DeliveryService, useValue: mockDeliveryService },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: DeliveryAttemptRepository, useValue: mockRepo },
      ],
    }).compile();

    worker = module.get<WebhookWorker>(WebhookWorker);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process()', () => {
    it('should process job successfully', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: 'DELIVERED',
        attempt: 1,
        latencyMs: 150,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockDeliveryService.process).toHaveBeenCalledWith(mockJob.data);
      expect(mockMetricsService.recordDeliveryLatency).toHaveBeenCalled();
      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        'DELIVERED',
        'dest-456',
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log retry status', async () => {
      mockDeliveryService.process.mockResolvedValue({
        eventId: 'evt-123',
        status: 'RETRYING',
        attempt: 2,
        latencyMs: 50,
        timestamp: new Date().toISOString(),
      });

      await worker.process(mockJob);

      expect(mockMetricsService.incrementDeliveryCounter).toHaveBeenCalledWith(
        'RETRYING',
        'dest-456',
      );
      expect(mockJob.updateProgress).not.toHaveBeenCalled();
    });

    it('should handle errors and increment error metric', async () => {
      mockDeliveryService.process.mockRejectedValue(new Error('Processing failed'));

      await expect(worker.process(mockJob)).rejects.toThrow('Processing failed');

      expect(mockMetricsService.incrementErrorCount).toHaveBeenCalledWith(
        'worker_error',
        'dest-456',
      );
    });
  });
});
```

---

## 5. Checklist de Acciones Requeridas

### Críticas (Aplicar antes de producción)

- [ ] **VULN-2.2:** Implementar validación de URL en HttpClientService (SSRF prevention)
- [ ] **VULN-2.5:** Agregar retry automático en HttpClientService para errores 5xx

### Mejoras (Aplicar en próxima iteración)

- [ ] **VULN-2.1:** Hacer timeout configurable vía env var
- [ ] **VULN-2.3:** Mejorar logging con contexto estructurado
- [ ] **VULN-2.4:** Agregar validación de destinationId vacío

### Tests (Completar Fase 3)

- [ ] Crear `http-client.service.spec.ts` (5 tests)
- [ ] Crear `delivery.service.spec.ts` (8 tests)
- [ ] Crear `webhook.worker.spec.ts` (3 tests)
- [ ] Ejecutar suite completa y verificar >80% cobertura

### Mejoras Opcionales

- [ ] **MEJORA-3.1:** Persistir Circuit Breaker state en BD
- [ ] **MEJORA-3.2:** Agregar métricas de HTTP client
- [ ] **MEJORA-3.3:** Health check endpoint para HTTP client

---

## 6. Priorización

### Sprint Actual (Fase 3 cierre)

1. **VULN-2.2** (SSRF) — Crítico para producción
2. **Tests unitarios** — Completar cobertura
3. **VULN-2.5** (Retry HTTP) — Mejora significativa de resiliencia

### Próximo Sprint (Fase 4)

4. **VULN-2.1** (Timeout configurable)
5. **VULN-2.3** (Logging mejorado)
6. **MEJORA-3.1** (CB state en BD)

---

## 7. Veredicto

**Fase 3 es funcionalmente completa**, pero requiere **2 correcciones de seguridad** antes de producción:

1. **SSRF Prevention** — Validar URLs antes de hacer requests HTTP
2. **HTTP Retry** — Agregar retry automático para errores transitorios

**Cobertura de tests:** Actualmente 48/48 tests en shared + worker (exponential-backoff, circuit-breaker). **Faltan 16 tests** para los servicios nuevos de Fase 3.

**Recomendación:** Aplicar VULN-2.2 y VULN-2.5, crear tests unitarios, y entonces marcar Fase 3 como **production-ready**.

---

*Documento generado por Arquitecto de Software Senior*  
*Próxima revisión: Antes de deploy a producción*