const http = require('http');
const { register, Counter, Histogram, Gauge } = require('prom-client');

register.clear();

const deliveryCounter = new Counter({
  name: 'webhook_delivery_total',
  help: 'Total de entregas por estado',
  labelNames: ['status', 'source'],
});

const deliveryLatency = new Histogram({
  name: 'webhook_delivery_latency_ms',
  help: 'Latencia de entrega en ms',
  buckets: [10, 25, 50, 100, 200, 500, 1000, 2000],
  labelNames: ['source'],
});

const queueLagGauge = new Gauge({
  name: 'webhook_queue_lag',
  help: 'Lag de la cola de webhooks en segundos',
  labelNames: ['queue'],
});

const errorCounter = new Counter({
  name: 'webhook_error_total',
  help: 'Total de errores por tipo',
  labelNames: ['error_type', 'source'],
});

// Datos de demo
deliveryCounter.inc({ status: 'delivered', source: 'stripe' }, 42);
deliveryCounter.inc({ status: 'failed', source: 'stripe' }, 3);
deliveryCounter.inc({ status: 'delivered', source: 'github' }, 15);
deliveryLatency.observe({ source: 'stripe' }, 45);
deliveryLatency.observe({ source: 'stripe' }, 120);
deliveryLatency.observe({ source: 'github' }, 230);
queueLagGauge.set({ queue: 'webhooks' }, 2.5);
errorCounter.inc({ error_type: 'timeout', source: 'stripe' }, 1);
errorCounter.inc({ error_type: 'network', source: 'github' }, 2);

const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(await register.metrics());
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`
      <h1>Webhook Hub — Métricas Prometheus</h1>
      <p><a href="/metrics"><strong>Ver /metrics</strong></a></p>
      <p>Métricas expuestas:</p>
      <ul>
        <li>webhook_delivery_total (Counter)</li>
        <li>webhook_delivery_latency_ms (Histogram)</li>
        <li>webhook_queue_lag (Gauge)</li>
        <li>webhook_error_total (Counter)</li>
      </ul>
    `);
  }
});

server.listen(3000, () => {
  console.log('========================================');
  console.log('Servidor de métricas corriendo!');
  console.log('Abre tu navegador en: http://localhost:3000');
  console.log('Métricas: http://localhost:3000/metrics');
  console.log('========================================');
});