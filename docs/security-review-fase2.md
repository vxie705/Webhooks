# Revisión de Seguridad — Fase 2 (Ingestor + Persistencia)

> **Rol:** Arquitecto de Software Senior — Security Review  
> **Fecha:** 2026-06-18  
> **Alcance:** Fase 2 completa (Ingestor, Database Package, Guards, Servicios)  
> **Objetivo:** Identificar vulnerabilidades, riesgos de seguridad y problemas de resiliencia ante carga alta

---

## 1. Resumen Ejecutivo

| Categoría | Vulnerabilidades Críticas | Vulnerabilidades Altas | Vulnerabilidades Medias | Recomendaciones |
|-----------|--------------------------|----------------------|------------------------|-----------------|
| **Rate Limiting** | 1 | 1 | 0 | 2 |
| **API Key Auth** | 1 | 0 | 1 | 2 |
| **HMAC Security** | 0 | 1 | 1 | 2 |
| **IP Whitelist** | 1 | 0 | 0 | 1 |
| **OAuth2** | 1 | 0 | 1 | 2 |
| **Idempotencia** | 0 | 1 | 1 | 2 |
| **Database** | 0 | 1 | 2 | 3 |
| **Redis** | 0 | 1 | 1 | 2 |
| **Input Validation** | 0 | 1 | 1 | 2 |
| **Error Handling** | 0 | 0 | 1 | 1 |
| **TOTAL** | **4** | **6** | **9** | **19** |

---

## 2. Vulnerabilidades Críticas (CRITICAL)

### 2.1 Rate Limiting — Race Condition en Distributed Systems

**Archivo:** `apps/ingestor/src/common/ratelimit/rate-limit.service.ts`  
**Líneas:** 18-27  
**Severidad:** CRITICAL  
**CWE:** CWE-362 (Race Condition)

```typescript
async isRateLimited(clientId: string): Promise<boolean> {
  const key = `ratelimit:${clientId}`;
  const current = await this.redis.incr(key);  // ← Paso 1: INCR

  if (current === 1) {
    await this.redis.pexpire(key, this.WINDOW_MS);  // ← Paso 2: PEXPIRE
  }

  return current > this.MAX_REQUESTS;
}
```

**Problema:**  
La operación `INCR` + `PEXPIRE` no es atómica. En un escenario de alta concurrencia con múltiples instancias del Ingestor:

1. **Instancia A:** `INCR ratelimit:client1` → devuelve 1
2. **Instancia B:** `INCR ratelimit:client1` → devuelve 2 (antes de que A ejecute PEXPIRE)
3. **Instancia A:** `PEXPIRE ratelimit:client1` → establece TTL
4. **Instancia B:** `current === 1` es falso, no establece TTL

Si la clave expira y es recreada por otra instancia, el TTL puede no establecerse correctamente, permitiendo **bypass del rate limit**.

**Impacto:**  
- Un atacante puede evadir el rate limit enviando requests desde múltiples instancias simultáneamente
- Posible DoS al consumir todos los recursos sin restricción

**Solución:**  
Usar el comando atómico `SET` con `NX` + `GET` en una transacción Lua o usar `INCR` + `PEXPIRE` en un script Lua:

```typescript
// Solución con script Lua atómico
const rateLimitScript = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;
const current = await this.redis.eval(rateLimitScript, 1, key, this.WINDOW_MS);
```

---

### 2.2 API Key Guard — Timing Attack + Full Table Scan

**Archivo:** `packages/database/src/destination.repository.ts`  
**Líneas:** 11-15  
**Severidad:** CRITICAL  
**CWE:** CWE-208 (Observable Timing Discrepancy), CWE-789 (Memory Allocation)

```typescript
async findByApiKey(apiKey: string) {
  return this.prisma.destination.findFirst({
    where: { apiKey },
  });
}
```

**Problema:**  
1. **Timing Attack:** `findFirst` realiza un escaneo completo de la tabla si `apiKey` no es único. El tiempo de respuesta varía según la posición del registro, permitiendo a un atacante inferir información sensible mediante análisis de tiempo.
2. **Performance:** Sin índice único, la consulta es O(n) en lugar de O(1). Con 1M de destinos, esto causa timeouts y denegación de servicio.

**Impacto:**  
- Exposición de información sensible (existencia de API keys, patrones de nombres)
- Degradación de performance bajo carga (p99 > 100ms)
- Posible DoS por consultas lentas

**Solución:**  
Agregar `@unique` al campo `apiKey` en Prisma schema:

```prisma
model Destination {
  id       String @id @default(uuid()) @db.Uuid
  name     String @unique
  url      String
  apiKey   String @unique @map("api_key")  // ← AGREGAR @unique
  // ...
}
```

---

### 2.3 IP Whitelist Guard — Bypass Completo de Seguridad

**Archivo:** `apps/ingestor/src/auth/ip-whitelist.guard.ts`  
**Líneas:** 15-17  
**Severidad:** CRITICAL  
**CWE:** CWE-290 (Authentication Bypass by Spoofing)

```typescript
// TODO: Implement IP whitelist check when Destination model has allowedIps field
// For now, allow all IPs if destination is valid
return true;
```

**Problema:**  
El guard está completamente deshabilitado. Cualquier IP puede enviar webhooks si tiene una API Key válida, incluso si el destino configuró una whitelist.

**Impacto:**  
- Cualquier atacante con una API Key filtrada puede enviar webhooks desde cualquier IP
- Se viola una de las capas de seguridad del sistema (Capa 2 según README.md)

**Solución:**  
Implementar el campo `allowedIps` en el modelo Destination y validar en el guard:

```typescript
const allowedIps = destination.allowedIps as string[];
if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
  throw new UnauthorizedException('IP not whitelisted');
}
```

---

### 2.4 OAuth2 Guard — Validación Incompleta (False Sense of Security)

**Archivo:** `apps/ingestor/src/auth/oauth2.guard.ts`  
**Líneas:** 19-24  
**Severidad:** CRITICAL  
**CWE:** CWE-287 (Improper Authentication)

```typescript
// TODO: Implement full JWT validation against OAuth2 provider's public key
// For now, validate that the token exists and is a reasonable JWT format
const parts = token.split('.');
if (parts.length !== 3) {
  throw new UnauthorizedException('Invalid JWT format');
}
return true;
```

**Problema:**  
El guard solo valida que el token tenga 3 partes (formato JWT), pero no verifica:
- Firma del JWT (cualquier token con 3 partes es aceptado)
- Expiración (`exp`)
- Emisor (`iss`)
- Audiencia (`aud`)
- Scope/permisos

**Impacto:**  
- Cualquier JWT malicioso con formato válido es aceptado
- Un atacante puede crear un JWT autofirmado con claims arbitrarios
- Se viola la capa de autenticación OAuth2

**Solución:**  
Implementar validación completa con `jsonwebtoken` o `@nestjs/jwt`:

```typescript
import * as jwt from 'jsonwebtoken';

const decoded = jwt.verify(token, publicKey, {
  algorithms: ['RS256'],
  issuer: process.env.OAUTH2_ISSUER,
  audience: process.env.OAUTH2_AUDIENCE,
});

if (!decoded.scope?.includes('webhook:send')) {
  throw new UnauthorizedException('Insufficient permissions');
}
```

---

## 3. Vulnerabilidades Altas (HIGH)

### 3.1 HMAC Guard — Sin Validación de Algoritmo

**Archivo:** `apps/ingestor/src/auth/hmac.guard.ts`  
**Líneas:** 20-23  
**Severidad:** HIGH  
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)

```typescript
const expected = crypto
  .createHmac('sha256', destination.apiKey)
  .update(rawBody)
  .digest('hex');
```

**Problema:**  
El algoritmo SHA-256 está hardcodeado. Si un destino configura SHA-1 (inseguro) o MD5, el sistema no lo detecta. Además, no hay validación de la longitud de la clave HMAC.

**Impacto:**  
- Un destino podría usar algoritmos débiles sin detección
- Posible downgrade attack si se permite configuración de algoritmo

**Solución:**  
Forzar SHA-256 y validar longitud mínima de clave:

```typescript
const MIN_KEY_LENGTH = 32; // 256 bits
if (destination.apiKey.length < MIN_KEY_LENGTH) {
  throw new UnauthorizedException('API Key too short for HMAC');
}

const expected = crypto
  .createHmac('sha256', destination.apiKey)
  .update(rawBody)
  .digest('hex');
```

---

### 3.2 Idempotency — Race Condition en Release Lock

**Archivo:** `apps/ingestor/src/common/idempotency/idempotency.service.ts`  
**Líneas:** 38-42  
**Severidad:** HIGH  
**CWE:** CWE-362 (Race Condition)

```typescript
async releaseLock(idempotencyKey: string): Promise<void> {
  await this.redis.del(`idempotency:${idempotencyKey}`);
}
```

**Problema:**  
El `releaseLock` se ejecuta en el `finally` block del controller. Si el TTL expira (1 hora) y otro request adquiere el lock, el `finally` del primer request liberará el lock del segundo request.

**Escenario:**
1. Request A: adquiere lock `idempotency:key1` (TTL 1h)
2. Request A: falla en `persistEvent()`, tarda 2h en recuperarse
3. Request B: adquiere lock `idempotency:key1` (TTL 1h)
4. Request A: finally ejecuta `releaseLock`, elimina el lock de B

**Impacto:**  
- Duplicados procesados como nuevos
- Pérdida de garantía de idempotencia

**Solución:**  
Usar un token único en el valor del lock y verificar antes de eliminar:

```typescript
private readonly lockToken = crypto.randomUUID();

async tryAcquireLock(idempotencyKey: string): Promise<boolean> {
  const result = await this.redis.set(
    `idempotency:${idempotencyKey}`,
    this.lockToken,
    'NX',
    'EX',
    this.TTL_SECONDS,
  );
  return result === 'OK';
}

async releaseLock(idempotencyKey: string): Promise<void> {
  const token = await this.redis.get(`idempotency:${idempotencyKey}`);
  if (token === this.lockToken) {
    await this.redis.del(`idempotency:${idempotencyKey}`);
  }
}
```

---

### 3.3 Database — Sin Límite de Pool de Conexiones

**Archivo:** `packages/database/src/prisma.service.ts`  
**Severidad:** HIGH  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**  
PrismaClient usa el pool de conexiones por defecto de PostgreSQL (100 conexiones). Con 10 instancias del Ingestor y 10 Workers, se pueden abrir 2000 conexiones simultáneas, agotando los límites de PostgreSQL.

**Impacto:**  
- Agotamiento de conexiones a PostgreSQL
- Denegación de servicio para otras aplicaciones
- Timeouts en consultas

**Solución:**  
Configurar límites en el connection string:

```typescript
// .env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10"

// O en Prisma schema:
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // ...
}
```

---

### 3.4 Redis — Sin Connection Pooling ni Timeout

**Archivo:** `apps/ingestor/src/common/idempotency/idempotency.service.ts`  
**Líneas:** 9-14  
**Severidad:** HIGH  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

```typescript
constructor() {
  this.redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });
}
```

**Problema:**  
Cada instancia de `IdempotencyService` y `RateLimitService` crea una conexión Redis independiente. Sin límites de conexiones ni timeouts, bajo carga alta se pueden abrir miles de conexiones.

**Impacto:**  
- Agotamiento de conexiones Redis
- Aumento de latencia (p99 > 100ms)
- Posible caída de Redis por sobrecarga

**Solución:**  
Usar un singleton de Redis compartido y configurar timeouts:

```typescript
// packages/database/src/redis.service.ts
@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      connectTimeout: 10000,
      lazyConnect: true,
    });
  }

  async onModuleInit() {
    await this.redis.connect();
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
```

---

## 4. Vulnerabilidades Medias (MEDIUM)

### 4.1 Input Validation — Sin Límite de Tamaño de Payload

**Archivo:** `apps/ingestor/src/main.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**  
El middleware `express.json()` no tiene límite de tamaño. Un atacante puede enviar un payload de 1GB, consumiendo toda la memoria del Ingestor.

**Impacto:**  
- Agotamiento de memoria (OOM kill)
- Denegación de servicio

**Solución:**  
```typescript
app.use(
  express.json({
    limit: '256kb', // Límite de tamaño
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
```

---

### 4.2 Error Handling — Information Leakage

**Archivo:** `apps/ingestor/src/common/filters/http-exception.filter.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

**Problema:**  
En desarrollo, el filtro devuelve mensajes de error detallados que pueden exponer:
- Rutas internas del sistema
- Tipos de excepciones
- Stack traces

**Impacto:**  
- Ayuda a atacantes a mapear la estructura interna
- Facilita ataques dirigidos

**Solución:**  
Ofuscar mensajes en producción:

```typescript
const message = status >= 500 && process.env.NODE_ENV === 'production'
  ? 'Internal server error'
  : exception.message;
```

---

### 4.3 Database — Sin Índice en apiKey (ya cubierto en 2.2)

**Archivo:** `packages/database/prisma/schema.prisma`  
**Severidad:** MEDIUM  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**  
Falta de índice en `apiKey` causa full table scan (ver 2.2).

---

### 4.4 Rate Limiting — Sin Protección por IP cuando no hay API Key

**Archivo:** `apps/ingestor/src/common/ratelimit/rate-limit.guard.ts`  
**Líneas:** 21  
**Severidad:** MEDIUM  
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

```typescript
const clientId = request.headers['x-api-key'] || request.ip;
```

**Problema:**  
Si un atacante no envía API Key, el rate limit se aplica por IP. Pero los guards de autenticación se ejecutan DESPUÉS del rate limiter, por lo que un atacante puede enviar requests sin API Key y agotar el rate limit de una IP legítima.

**Impacto:**  
- Denegación de servicio por agotamiento de rate limit
- Ataque de amplificación (un atacante usa muchas IPs)

**Solución:**  
Mover el rate limiter después de la autenticación o usar un identificador diferente:

```typescript
const clientId = request.headers['x-api-key'] 
  ? `api:${request.headers['x-api-key']}`
  : `ip:${request.ip}`;
```

---

### 4.5 Circuit Breaker — Sin Jitter en HALF_OPEN

**Archivo:** `apps/worker/src/delivery/circuit-breaker/circuit-breaker.service.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Problema:**  
Cuando el circuito pasa a HALF_OPEN, todos los workers intentan hacer una petición de prueba simultáneamente (thundering herd).

**Impacto:**  
- Pico de tráfico hacia destinos en recuperación
- Posible cascada de fallos

**Solución:**  
Agregar jitter aleatorio al timeout:

```typescript
private readonly HALF_OPEN_JITTER_MS = 5000; // 0-5s aleatorio

async canProceed(destinationId: string): Promise<boolean> {
  const state = await this.getState(destinationId);
  if (state === CircuitState.OPEN) {
    const lastAttempt = await this.redis.get(`cb:last_attempt:${destinationId}`);
    const now = Date.now();
    const jitter = Math.random() * this.HALF_OPEN_JITTER_MS;
    
    if (!lastAttempt || (now - parseInt(lastAttempt)) > (this.TIMEOUT_OPEN_MS + jitter)) {
      // ...
    }
  }
}
```

---

### 4.6 HMAC — Sin Replay Protection

**Archivo:** `apps/ingestor/src/auth/hmac.guard.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-294 (Transaction Replay)

**Problema:**  
El HMAC valida la firma pero no previene replay attacks. Un atacante puede capturar un request válido y reenviarlo múltiples veces.

**Impacto:**  
- Procesamiento duplicado de eventos
- Posible doble cobro en sistemas de pago

**Solución:**  
Agregar timestamp y nonce al header, validar en el guard:

```typescript
const timestamp = request.headers['x-timestamp'];
const nonce = request.headers['x-nonce'];

// Rechazar si timestamp > 5 minutos
if (Math.abs(Date.now() - parseInt(timestamp)) > 300000) {
  throw new UnauthorizedException('Request expired');
}

// Verificar que el nonce no fue usado antes
const nonceKey = `hmac:nonce:${nonce}`;
const exists = await this.redis.set(nonceKey, '1', 'NX', 'EX', 3600);
if (!exists) {
  throw new UnauthorizedException('Duplicate request');
}
```

---

### 4.7 Database — Sin Paginación en Consultas

**Archivo:** `packages/database/src/event.repository.ts`  
**Líneas:** 20-28  
**Severidad:** MEDIUM  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

```typescript
async findById(id: string) {
  return this.prisma.webhookEvent.findUnique({
    where: { id },
    include: {
      deliveryAttempts: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}
```

**Problema:**  
`findById` incluye todos los `deliveryAttempts` sin límite. Si un evento tiene 10,000 intentos, la consulta devuelve todos, causando alta latencia y consumo de memoria.

**Impacto:**  
- Latencia alta en consultas de eventos con muchos intentos
- Posible OOM en el Ingestor/Worker

**Solución:**  
Agregar paginación:

```typescript
async findById(id: string, limit = 100, offset = 0) {
  return this.prisma.webhookEvent.findUnique({
    where: { id },
    include: {
      deliveryAttempts: {
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      },
    },
  });
}
```

---

### 4.8 Error Messages — Information Leakage en Producción

**Archivo:** `apps/ingestor/src/common/filters/http-exception.filter.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

**Problema:**  
Ver sección 4.4. El filtro devuelve mensajes detallados en desarrollo, pero no hay validación estricta de `NODE_ENV`.

**Impacto:**  
- Exposición de información interna en entornos de staging

**Solución:**  
Usar un flag explícito `DEBUG_MODE` en lugar de confiar en `NODE_ENV`.

---

### 4.9 No CSRF Protection

**Archivo:** `apps/ingestor/src/main.ts`  
**Severidad:** MEDIUM  
**CWE:** CWE-352 (Cross-Site Request Forgery)

**Problema:**  
La API no tiene protección CSRF. Aunque es menos crítico para una API de webhooks (usada por máquinas), si hay un frontend que consume la API, es vulnerable.

**Impacto:**  
- Bajo para API pura, medio si hay frontend

**Solución:**  
Agregar CSRF guard o usar `SameSite` cookies si hay sesiones.

---

## 5. Recomendaciones de Resiliencia

### 5.1 Graceful Degradation — Redis Caído

**Archivo:** `apps/ingestor/src/common/idempotency/idempotency.service.ts`  
**Recomendación:** HIGH

**Problema:**  
Si Redis cae, el Ingestor falla completamente (no puede adquirir locks ni hacer rate limiting).

**Solución:**  
Implementar fallback a base de datos o modo degradado:

```typescript
async tryAcquireLock(idempotencyKey: string): Promise<boolean> {
  try {
    const result = await this.redis.set(...);
    return result === 'OK';
  } catch (error) {
    this.logger.warn('Redis unavailable, falling back to database lock');
    // Fallback: usar base de datos con advisory lock
    return await this.databaseLock.tryAcquire(idempotencyKey);
  }
}
```

---

### 5.2 Request Size Limit

**Archivo:** `apps/ingestor/src/main.ts`  
**Recomendación:** HIGH

```typescript
app.use(
  express.json({
    limit: '256kb', // Limitar tamaño de payload
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
```

---

### 5.3 Request Timeout

**Archivo:** `apps/ingestor/src/main.ts`  
**Recomendación:** MEDIUM

```typescript
const server = app.listen(port);
server.setTimeout(30000); // 30s timeout
server.keepAliveTimeout = 5000;
```

---

## 6. Checklist de Acciones Correctivas

| # | Vulnerabilidad | Prioridad | Archivo | Acción |
|---|----------------|-----------|---------|--------|
| 1 | Rate Limit Race Condition | CRITICAL | rate-limit.service.ts | Usar script Lua atómico |
| 2 | API Key Full Table Scan | CRITICAL | schema.prisma | Agregar `@unique` a apiKey |
| 3 | IP Whitelist Bypass | CRITICAL | ip-whitelist.guard.ts | Implementar allowedIps |
| 4 | OAuth2 Incompleto | CRITICAL | oauth2.guard.ts | Validar JWT completo |
| 5 | HMAC Sin Validación de Algoritmo | HIGH | hmac.guard.ts | Forzar SHA-256 + validar longitud |
| 6 | Idempotency Race Condition | HIGH | idempotency.service.ts | Token único en lock value |
| 7 | Database Pool Ilimitado | HIGH | prisma.service.ts | Configurar connection_limit |
| 8 | Redis Sin Pooling | HIGH | redis.service.ts | Singleton + timeouts |
| 9 | Sin Límite de Payload | MEDIUM | main.ts | `express.json({ limit: '256kb' })` |
| 10 | Information Leakage | MEDIUM | http-exception.filter.ts | Ofuscar errores en prod |
| 11 | Rate Limit Bypass por IP | MEDIUM | rate-limit.guard.ts | Mover después de auth |
| 12 | Thundering Herd | MEDIUM | circuit-breaker.service.ts | Agregar jitter |
| 13 | Sin Replay Protection | MEDIUM | hmac.guard.ts | Timestamp + nonce |
| 14 | Sin Paginación | MEDIUM | event.repository.ts | Agregar take/skip |
| 15 | Sin CSRF Protection | MEDIUM | main.ts | CSRF guard o SameSite |

---

## 7. Próximos Pasos

1. **Inmediato (Fase 2.1):** Corregir vulnerabilidades CRITICAL (#1-4)
2. **Corto plazo (Fase 2.2):** Corregir vulnerabilidades HIGH (#5-8)
3. **Mediano plazo (Fase 3):** Corregir vulnerabilidades MEDIUM (#9-15) y agregar tests de seguridad

---

*Documento generado por Arquitecto Senior — Webhook Hub*  
*Versión: 1.0 — Fase 2 Security Review*