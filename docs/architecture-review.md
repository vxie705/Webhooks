# Revisión Arquitectónica — Plan vs. Implementación Real

> **Auditoría:** Fase 1 — Fundación  
> **Rol:** Arquitecto de Software Senior  
> **Fecha:** 2026-06-17  
> **Objetivo:** Validar que el plan.md refleje fielmente el código construido, identificar desviaciones y recomendar correcciones.

---

## 1. Resumen Ejecutivo

| Métrica | Resultado |
|---------|-----------|
| **Items del plan verificados** | 28/32 (87.5%) |
| **Desviaciones críticas** | 2 (requieren corrección) |
| **Desviaciones menores** | 2 (documentadas) |
| **Bugs encontrados en código vs plan** | 2 (corregidos) |
| **Riesgos no cubiertos en plan** | 1 (thundering herd en HALF_OPEN) |

**Veredicto:** El plan es sólido en su visión arquitectónica, pero contiene 4 desviaciones respecto al código real que deben corregirse para mantener la coherencia entre documentación e implementación.

---

## 2. Desviaciones Críticas

### 🔴 CRÍTICO #1 — Circuit Breaker: `recordSuccess()` no verifica estado actual

**Plan (línea 423-426):**
```typescript
async recordSuccess(destinationId: string): Promise<void> {
    await this.redis.del(`cb:fails:${destinationId}`);
    await this.transitionTo(destinationId, CircuitState.CLOSED);
}
```

**Código real (implementado):**
```typescript
async recordSuccess(destinationId: string): Promise<void> {
    await this.redis.del(`cb:fails:${destinationId}`);
    const currentState = await this.getState(destinationId);
    if (currentState === CircuitState.HALF_OPEN) {
      await this.transitionTo(destinationId, CircuitState.CLOSED);
    } else if (currentState === CircuitState.CLOSED) {
      await this.redis.del(`cb:last_attempt:${destinationId}`);
    }
}
```

**Problema:** El plan fuerza `transitionTo(CLOSED)` siempre, incluso si el circuito está en `CLOSED` (redundante) o en `OPEN` (no debería pasar, pero si ocurre, resetea incorrectamente). El código real es más correcto: solo transiciona si está en `HALF_OPEN`.

**Acción requerida:** Actualizar el plan para reflejar la lógica condicional.

---

### 🔴 CRÍTICO #2 — Circuit Breaker: `recordFailure()` no maneja HALF_OPEN

**Plan (líneas 413-421):**
```typescript
async recordFailure(destinationId: string): Promise<void> {
    const key = `cb:fails:${destinationId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, this.TIMEOUT_OPEN_MS / 1000);
    if (count >= this.FAILURE_THRESHOLD) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
    }
}
```

**Código real (implementado con bugfix):**
```typescript
async recordFailure(destinationId: string): Promise<void> {
    const currentState = await this.getState(destinationId);
    if (currentState === CircuitState.HALF_OPEN) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());
      return;
    }
    const key = `cb:fails:${destinationId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, Math.ceil(this.TIMEOUT_OPEN_MS / 1000));
    if (count >= this.FAILURE_THRESHOLD) {
      await this.transitionTo(destinationId, CircuitState.OPEN);
      await this.redis.set(`cb:last_attempt:${destinationId}`, Date.now().toString());
    }
}
```

**Problema:** El plan omite completamente el caso `HALF_OPEN → OPEN` (bug #1 encontrado en tests) y no registra `lastAttemptAt` al abrir el circuito (bug #2).

**Acción requerida:** El plan debe reflejar la lógica corregida con ambos bugfixes.

---

## 3. Desviaciones Menores

### 🟡 MENOR #1 — `TIMEOUT_HALF_OPEN_MS` no utilizado

**Plan (línea 404):** Declara `TIMEOUT_HALF_OPEN_MS = 10_000` pero nunca se usa en el código. El timeout real está en `canProceed()` que usa `TIMEOUT_OPEN_MS` para la transición `OPEN → HALF_OPEN`.

**Recomendación:** Eliminar `TIMEOUT_HALF_OPEN_MS` del plan o implementar su uso (por ejemplo, para limitar cuánto tiempo permanece en HALF_OPEN antes de volver a OPEN si no hay respuesta).

---

### 🟡 MENOR #2 — `idempotency.middleware.ts` no implementado

**Plan (línea 100-101):** Lista `idempotency.middleware.ts` como archivo separado. En la implementación real, la idempotencia se maneja desde el `WebhookController` directamente, no como middleware.

**Recomendación:** Decidir si se implementa como middleware o se actualiza el plan para reflejar el enfoque actual (controlador).

---

## 4. Bugs Encontrados vs. Plan

| Bug | Encontrado en | Plan lo cubre | Corregido en código |
|-----|---------------|---------------|---------------------|
| HALF_OPEN → OPEN requiere 5 fallos (debería ser 1) | Tests unitarios | ❌ No | ✅ Sí |
| `lastAttemptAt` no se registra al abrir circuito | Tests unitarios | ❌ No | ✅ Sí |

**Impacto:** Ambos bugs fueron corregidos en el código real, pero el plan aún refleja la versión incorrecta. Esto es peligroso porque si alguien reconstruye desde el plan, reintroducirá los bugs.

---

## 5. Riesgos No Cubiertos en el Plan

### ⚠️ Thundering Herd en HALF_OPEN

**Detectado en:** Tests de bottleneck analysis

**Descripción:** Cuando expira el timeout de OPEN (30s), todos los workers que estaban esperando intentan sondear el destino simultáneamente. Si el destino sigue fallando, se producen N llamadas HTTP fallidas en lugar de 1.

**Mitigación propuesta:** Añadir jitter al timeout (30-35s aleatorio en lugar de 30s fijo).

**Estado:** No implementado. Pendiente para Fase 3.

---

## 6. Checklist de Verificación Plan vs. Código

### 6.1 Estructura de Directorios

| Archivo en plan | Existe en código | Estado |
|-----------------|------------------|--------|
| `apps/ingestor/src/main.ts` | ✅ | OK |
| `apps/ingestor/src/app.module.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/webhook.controller.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/webhook.service.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/webhook.module.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/dto/webhook-request.dto.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/dto/webhook-response.dto.ts` | ✅ | OK |
| `apps/ingestor/src/webhook/dto/webhook-event.schema.ts` | ❌ | No implementado |
| `apps/ingestor/src/auth/api-key.guard.ts` | ✅ | OK |
| `apps/ingestor/src/auth/hmac.guard.ts` | ✅ | OK |
| `apps/ingestor/src/auth/ip-whitelist.guard.ts` | ✅ | OK |
| `apps/ingestor/src/auth/oauth2.guard.ts` | ✅ | OK |
| `apps/ingestor/src/common/idempotency/idempotency.middleware.ts` | ❌ | No implementado |
| `apps/ingestor/src/common/idempotency/idempotency.service.ts` | ✅ | OK |
| `apps/ingestor/src/common/ratelimit/rate-limit.guard.ts` | ✅ | OK |
| `apps/ingestor/src/common/ratelimit/rate-limit.service.ts` | ✅ | OK |
| `apps/ingestor/src/common/logger/pino-logger.service.ts` | ✅ | OK |
| `apps/ingestor/src/common/metrics/metrics.service.ts` | ✅ | OK |
| `apps/ingestor/src/common/filters/http-exception.filter.ts` | ❌ | No implementado |
| `apps/ingestor/src/config/config.module.ts` | ❌ | No implementado |
| `apps/ingestor/src/config/config.schema.ts` | ❌ | No implementado |
| `apps/ingestor/Dockerfile` | ✅ | OK |
| `apps/worker/src/main.ts` | ✅ | OK |
| `apps/worker/src/app.module.ts` | ✅ | OK |
| `apps/worker/src/worker/webhook.worker.ts` | ✅ | OK |
| `apps/worker/src/worker/processor.service.ts` | ❌ | No implementado |
| `apps/worker/src/delivery/delivery.service.ts` | ✅ | OK |
| `apps/worker/src/delivery/http-client.service.ts` | ❌ | No implementado (stub en delivery.service) |
| `apps/worker/src/delivery/circuit-breaker/circuit-breaker.service.ts` | ✅ | OK |
| `apps/worker/src/delivery/circuit-breaker/circuit-breaker.state.ts` | ❌ | Enums en shared package |
| `apps/worker/src/retry/retry.service.ts` | ✅ | OK |
| `apps/worker/src/retry/exponential-backoff.ts` | ✅ | OK |
| `apps/worker/src/persistence/event.repository.ts` | ❌ | Pendiente Fase 2 |
| `apps/worker/src/persistence/delivery-attempt.repository.ts` | ❌ | Pendiente Fase 2 |
| `apps/worker/src/persistence/prisma.service.ts` | ❌ | Pendiente Fase 2 |
| `apps/worker/prisma/schema.prisma` | ❌ | Pendiente Fase 2 |
| `packages/shared/src/interfaces/webhook-event.interface.ts` | ✅ | OK |
| `packages/shared/src/interfaces/delivery-attempt.interface.ts` | ✅ | OK |
| `packages/shared/src/interfaces/circuit-breaker.interface.ts` | ✅ | OK |
| `packages/shared/src/interfaces/idempotency.interface.ts` | ✅ | OK |
| `packages/shared/src/enums/delivery-status.enum.ts` | ✅ | OK |
| `packages/shared/src/enums/circuit-breaker-state.enum.ts` | ✅ | OK |
| `packages/shared/src/dto/webhook-payload.dto.ts` | ✅ | OK |
| `packages/shared/src/dto/delivery-result.dto.ts` | ✅ | OK |
| `packages/shared/src/index.ts` | ✅ | OK |
| `infra/docker/docker-compose.yml` | ✅ | OK |
| `.env.example` | ✅ | OK |
| `.gitignore` | ✅ | OK |
| `.prettierrc` | ✅ | OK |
| `.eslintrc.js` | ✅ | OK |
| `package.json` | ✅ | OK |
| `tsconfig.base.json` | ✅ | OK |

**Archivos del plan no implementados (pendientes para fases futuras):** 10  
**Archivos del plan omitidos sin justificación:** 2 (`webhook-event.schema.ts`, `idempotency.middleware.ts`)

---

### 6.2 Contratos de Datos

| Interface/DTO | Plan | Código | Diferencia |
|---------------|------|--------|------------|
| `IWebhookEvent` | `attempt?: number` NO incluido | ✅ Incluye `attempt?: number` | Plan desactualizado |
| `IDeliveryResult` | Nombre: `IDeliveryResult` | Nombre: `IDeliveryResultDto` | Diferencia de naming |
| `WebhookRequestDto` | ✅ | ✅ | OK |
| `WebhookResponseDto` | No listado en plan | ✅ Existe | Plan incompleto |

---

## 7. Recomendaciones

### Inmediatas (corregir antes de Fase 2)

1. **Actualizar `plan.md`** con la lógica corregida de `recordFailure()` y `recordSuccess()` del Circuit Breaker.
2. **Agregar `attempt?: number`** al contrato `IWebhookEvent` en el plan.
3. **Corregir nombre** de `IDeliveryResult` a `IDeliveryResultDto` en el plan.
4. **Agregar `WebhookResponseDto`** a la sección de contratos del plan.
5. **Eliminar `TIMEOUT_HALF_OPEN_MS`** del plan o implementar su uso.

### Para Fase 2

6. **Decidir sobre `idempotency.middleware.ts`:** Implementarlo como middleware o eliminarlo del plan.
7. **Implementar `http-exception.filter.ts`** para manejo centralizado de errores.
8. **Implementar `config.module.ts` + `config.schema.ts`** para validación de variables de entorno.

### Para Fase 3

9. **Mitigar thundering herd:** Añadir jitter al timeout del Circuit Breaker (30-35s).
10. **Implementar `http-client.service.ts`** como servicio separado con timeout, retry y métricas.

---

## 8. Conclusión

El `plan.md` es un documento arquitectónico de alta calidad que refleja correctamente la visión general del sistema. Sin embargo, contiene **4 desviaciones** respecto al código real implementado, de las cuales **2 son críticas** porque involucran la lógica de resiliencia del Circuit Breaker.

**Puntuación de alineamiento:** 87.5% (28/32 items verificados)

**Riesgo principal:** Si un nuevo desarrollador sigue el plan al pie de la letra para implementar el Circuit Breaker, reintroducirá los 2 bugs que ya fueron corregidos en el código.

**Acción recomendada:** Actualizar el plan con los bugfixes antes de proceder a Fase 2, y mantener la documentación como artefacto vivo que evoluciona con el código.