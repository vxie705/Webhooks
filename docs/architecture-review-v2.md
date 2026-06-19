# Revalidación Arquitectónica — Plan vs. Código (Post-Correcciones)

> **Auditoría:** V2 — Post-correcciones  
> **Rol:** Arquitecto de Software Senior  
> **Fecha:** 2026-06-17  
> **Objetivo:** Verificar que las 5 correcciones aplicadas al `plan.md` resuelvan las desviaciones identificadas en V1.

---

## 1. Verificación de Correcciones

| # | Corrección | Plan (antes) | Plan (después) | Código real | Estado |
|---|-----------|-------------|----------------|-------------|--------|
| 1 | `IWebhookEvent.attempt?` | ❌ No incluido | ✅ `attempt?: number` | ✅ Incluido | ✅ **CORREGIDO** |
| 2 | `IDeliveryResult` → `IDeliveryResultDto` | ❌ `IDeliveryResult` | ✅ `IDeliveryResultDto` | ✅ `IDeliveryResultDto` | ✅ **CORREGIDO** |
| 3 | `recordFailure()` maneja HALF_OPEN + timestamp | ❌ Solo contador | ✅ `getState()` + HALF_OPEN check + `lastAttemptAt` | ✅ Idéntico | ✅ **CORREGIDO** |
| 4 | `recordSuccess()` condicional | ❌ `transitionTo(CLOSED)` siempre | ✅ Solo si HALF_OPEN + limpia `lastAttemptAt` | ✅ Idéntico | ✅ **CORREGIDO** |
| 5 | `TIMEOUT_HALF_OPEN_MS` | ❌ Declarado (10_000) | ✅ Eliminado | ✅ No existe | ✅ **CORREGIDO** |

---

## 2. Verificación de Contratos de Datos

### 2.1 IWebhookEvent

```typescript
// Plan (línea 218) - CORREGIDO
export interface IWebhookEvent {
  id: string;
  source: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  idempotencyKey: string;
  signature?: string;
  attempt?: number;  // ✅ AHORA INCLUIDO
}

// Código real (packages/shared/src/interfaces/webhook-event.interface.ts)
export interface IWebhookEvent {
  id: string;
  source: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  idempotencyKey: string;
  signature?: string;
  attempt?: number;  // ✅ COINCIDE
}
```

### 2.2 IDeliveryResultDto

```typescript
// Plan (línea 259) - CORREGIDO
export interface IDeliveryResultDto {  // ✅ NOMBRE CORREGIDO
  eventId: string;
  status: DeliveryStatus;
  httpStatus?: number;
  attempt: number;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

// Código real (packages/shared/src/dto/delivery-result.dto.ts)
export interface IDeliveryResultDto {  // ✅ COINCIDE
  eventId: string;
  status: DeliveryStatus;
  httpStatus?: number;
  attempt: number;
  latencyMs: number;
  error?: string;
  timestamp: string;
}
```

---

## 3. Verificación de Circuit Breaker

### 3.1 recordFailure()

```typescript
// Plan (líneas 413-431) - CORREGIDO
async recordFailure(destinationId: string): Promise<void> {
    const currentState = await this.getState(destinationId);  // ✅ NUEVO

    if (currentState === CircuitState.HALF_OPEN) {            // ✅ NUEVO
      await this.transitionTo(destinationId, CircuitState.OPEN);
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());
      return;
    }

    const key = `cb:fails:${destinationId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, Math.ceil(this.TIMEOUT_OPEN_MS / 1000));

    if (count >= this.FAILURE_THRESHOLD) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());  // ✅ NUEVO
    }
}

// Código real (circuit-breaker.service.ts) - ✅ IDÉNTICO
```

### 3.2 recordSuccess()

```typescript
// Plan (líneas 434-443) - CORREGIDO
async recordSuccess(destinationId: string): Promise<void> {
    await this.redis.del(`cb:fails:${destinationId}`);
    const currentState = await this.getState(destinationId);  // ✅ NUEVO
    if (currentState === CircuitState.HALF_OPEN) {            // ✅ CONDICIONAL
      await this.transitionTo(destinationId, CircuitState.CLOSED);
    } else if (currentState === CircuitState.CLOSED) {
      await this.redis.del(`cb:last_attempt:${destinationId}`);  // ✅ NUEVO
    }
}

// Código real (circuit-breaker.service.ts) - ✅ IDÉNTICO
```

### 3.3 TIMEOUT_HALF_OPEN_MS

```typescript
// Plan (línea 404) - CORREGIDO
// ANTES: private readonly TIMEOUT_HALF_OPEN_MS = 10_000;
// DESPUÉS: ELIMINADO ✅

// Código real - ✅ NO EXISTE
```

---

## 4. Verificación de Flujo Completo

### 4.1 DeliveryService.process()

```typescript
// Plan (línea 480) - CORREGIDO
async process(event: IWebhookEvent, destination: Destination): Promise<IDeliveryResultDto> {
                                                                    // ✅ NOMBRE CORREGIDO
// Código real (delivery.service.ts) - ✅ COINCIDE
```

---

## 5. Checklist Final de Alineamiento

| Categoría | Items | Alineados | % |
|-----------|-------|-----------|---|
| Contratos de datos | 4 | 4 | **100%** |
| Circuit Breaker | 3 métodos | 3 | **100%** |
| Exponential Backoff | 2 métodos | 2 | **100%** |
| Ingestor Controller | 1 | 1 | **100%** |
| Inyección de dependencias | 2 módulos | 2 | **100%** |
| Observabilidad | 1 servicio | 1 | **100%** |
| **TOTAL** | **13** | **13** | **100%** |

---

## 6. Veredicto Final

> **El `plan.md` está ahora 100% alineado con el código real implementado.**

Todas las desviaciones identificadas en la revisión V1 han sido corregidas:

- ✅ Contratos de datos sincronizados (`attempt?`, `IDeliveryResultDto`)
- ✅ Circuit Breaker con lógica corregida (HALF_OPEN → OPEN, timestamps)
- ✅ `TIMEOUT_HALF_OPEN_MS` eliminado
- ✅ DeliveryService usa `IDeliveryResultDto`

**Riesgo de reintroducción de bugs:** Eliminado. Cualquier desarrollador que siga el plan ahora obtendrá la lógica correcta.

**Pendiente para Fase 3:** Mitigación del thundering herd en HALF_OPEN (añadir jitter al timeout 30-35s).

---

*Documento generado como validación post-correcciones. Archivar en `docs/architecture-review-v2.md`.*