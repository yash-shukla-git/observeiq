# @yashshukla/observeiq-node

Distributed tracing SDK for Node.js. Drop it into any service to trace requests end-to-end and send spans to an ObserveIQ collector.

---

## Install

```bash
npm install @yashshukla/observeiq-node
```

---

## Usage

```ts
import { Tracer } from '@yashshukla/observeiq-node';

const tracer = new Tracer({
  serviceName: 'order-service',
  collectorUrl: 'http://localhost:4318/ingest',
});

await tracer.trace('createOrder', async () => {
  // your logic here
  await db.insert(order);
});
```

Nested calls are automatically linked as parent/child spans:

```ts
await tracer.trace('handleRequest', async () => {
  await tracer.trace('validateUser', async () => { ... });
  await tracer.trace('fetchCart', async () => { ... });
});
```

---

## How it works

```
Your Service
    │
    ▼
tracer.trace()          ← wraps your function, records start/end time
    │
    │  AsyncLocalStorage propagates traceId + spanId across async calls
    ▼
POST /ingest            ← HTTP POST to collector with the Span payload
    │
    ▼
RabbitMQ                ← collector pushes span onto queue
    │
    ▼
Worker                  ← reads queue, inserts into PostgreSQL
    │
    ▼
Dashboard               ← waterfall chart built from span tree
```

---

## Span shape

```ts
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: number;       // Unix ms
  duration: number;        // ms
  status: 'ok' | 'error';
  tags: Record<string, string | number | boolean>;
  error?: string;
}
```

---

## Configuration

| Option | Type | Required | Description |
|---|---|---|---|
| `serviceName` | `string` | Yes | Name of the service emitting spans |
| `collectorUrl` | `string` | Yes | Full URL of the collector ingest endpoint |

---

## Requirements

- Node.js 18+
- An ObserveIQ collector running and reachable at `collectorUrl`

---

## Architecture

See the full platform: [github.com/yash-shukla-git/observeiq](https://github.com/yash-shukla-git/observeiq)

The monorepo contains:

```
observeiq/
├── apps/
│   ├── collector/     Express server — receives spans, pushes to RabbitMQ
│   ├── worker/        Reads queue, writes to PostgreSQL
│   └── dashboard/     Waterfall UI
├── packages/
│   └── sdk/           This package
└── docker-compose.yml PostgreSQL + RabbitMQ
```

---

## Contributing

1. Clone the repo

```bash
git clone https://github.com/yash-shukla-git/observeiq.git
cd observeiq
```

2. Install dependencies

```bash
npm install
cd packages/sdk && npm install
```

3. Start infrastructure

```bash
docker compose up -d
```

4. Build the SDK

```bash
cd packages/sdk
npm run build
```

5. Make your changes in `packages/sdk/src/`, rebuild, and verify spans appear in PostgreSQL.

Open a PR against `main`. Keep changes focused — one concern per PR.

---

## License

MIT
