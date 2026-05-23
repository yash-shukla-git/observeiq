# ObserveIQ

Self-hostable distributed tracing platform. Drop the SDK into any Node.js service, trace every request end-to-end, and visualise it as a live waterfall chart showing where time was spent and what failed.

---

## What it does

- Traces requests across multiple services with zero config beyond a service name
- Propagates trace context automatically across async boundaries using `AsyncLocalStorage`
- Collects spans via an HTTP ingest endpoint, buffers through a queue, and persists to PostgreSQL
- Displays a waterfall chart reconstructed from the parent/child span tree
- Tracks AI calls — OpenAI token usage and cost per request (Week 3)

---

## Architecture

```
Your Service
    │
    ▼
SDK (tracer.trace())         ← wraps your function, records timing + status
    │  AsyncLocalStorage propagates traceId + spanId across async calls
    ▼
Collector  POST /ingest      ← Express server, validates and queues spans
    │
    ▼
RabbitMQ  spans queue        ← decouples ingest from storage
    │
    ▼
Worker                       ← reads queue, inserts into PostgreSQL
    │
    ▼
PostgreSQL  spans table      ← flat span rows with parent_span_id
    │
    ▼
Dashboard                    ← reconstructs tree, renders waterfall chart
```

---

## Repo structure

```
observeiq/
├── apps/
│   ├── collector/       Express server — POST /ingest, pushes to RabbitMQ
│   ├── worker/          Queue consumer — reads spans, writes to PostgreSQL
│   └── dashboard/       Waterfall UI (Week 2)
├── packages/
│   └── sdk/             npm package — @yashshukla/observeiq-node
├── scripts/
│   └── mock-emitter.ts  Posts fake spans to test the pipeline
└── docker-compose.yml   PostgreSQL + RabbitMQ
```

---

## Stack

| Layer | Tech |
|---|---|
| SDK | TypeScript, AsyncLocalStorage |
| Collector | Node.js, Express |
| Queue | RabbitMQ |
| Storage | PostgreSQL |
| Dashboard | React (Week 2) |
| AI layer | OpenAI instrumentation (Week 3) |

---

## Running locally

**Prerequisites**: Node.js 18+, Docker

**1. Clone and install**

```bash
git clone https://github.com/yash-shukla-git/observeiq.git
cd observeiq
npm install
```

**2. Start infrastructure**

```bash
docker compose up -d
```

Starts PostgreSQL on port 5432 and RabbitMQ on port 5672 (management UI on 15672).

**3. Run the DB migration**

```bash
docker exec -i <postgres_container> psql -U postgres -d observeiq \
  < apps/worker/migrations/001_create_spans_table.sql
```

**4. Start the collector**

```bash
cd apps/collector
npm install && npm run dev
# Listening on port 4318
```

**5. Start the worker**

```bash
cd apps/worker
npm install && npm run dev
# Waiting for spans on queue: spans
```

**6. Fire the mock emitter**

```bash
cd scripts
TRACES=3 ts-node mock-emitter.ts
```

**7. Verify spans in PostgreSQL**

```bash
docker exec -it <postgres_container> psql -U postgres -d observeiq \
  -c "SELECT span_id, parent_span_id, service_name, operation_name, status FROM spans;"
```

---

## SDK

Published to npm as [`@yashshukla/observeiq-node`](https://www.npmjs.com/package/@yashshukla/observeiq-node).

```bash
npm install @yashshukla/observeiq-node
```

```ts
import { Tracer } from '@yashshukla/observeiq-node';

const tracer = new Tracer({
  serviceName: 'order-service',
  collectorUrl: 'http://localhost:4318/ingest',
});

await tracer.trace('createOrder', async () => {
  await db.insert(order);
});
```

See [`packages/sdk/README.md`](./packages/sdk/README.md) for full SDK docs.

---

## Contributing

1. Fork the repo and create a branch
2. Follow the local setup above
3. Make changes, verify spans flow through the full pipeline
4. Open a PR against `main` — one concern per PR

---

## License

MIT
