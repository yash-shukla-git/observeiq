# ObserveIQ

A self-hosted distributed tracing tool I built to learn how tools like Jaeger and Zipkin work. A small Node.js SDK records spans in your services, a collector queues them, a worker stores them in PostgreSQL, and a Next.js dashboard shows each trace as a waterfall chart.

## How it works

```
Your service
   |  tracer.trace() wraps a function and records start time, duration, status
   |  AsyncLocalStorage keeps the current traceId/spanId across awaits
   v
SDK  ---- POST /ingest (JSON, optional x-api-key) ---->  Collector (Express, port 4318)
                                                            |  validates, then publishes
                                                            v
                                                       RabbitMQ queue "spans"
                                                            |  worker consumes
                                                            v
                                                    Worker ---> PostgreSQL "spans" table
                                                       (unsavable spans go to queue "spans.dlq")
                                                            ^
Dashboard (Next.js, port 3000) --- GET /traces, /traces/:id ---- Collector reads the table
```

Files for each step:

| Step | File |
|---|---|
| Create spans, pass context between services | `packages/sdk/src/tracer.ts`, `context.ts` |
| Receive and validate spans | `apps/collector/src/index.ts`, `lib/validateSpan.ts` |
| Save spans, dead letter queue | `apps/worker/src/index.ts`, `errors.ts` |
| Table definitions | `apps/worker/migrations/*.sql` |
| Rebuild the parent/child tree | `apps/collector/src/lib/buildTree.ts` |
| Waterfall chart | `apps/dashboard/app/components/WaterfallChart.tsx` |
| Login (users table, signed cookie) | `apps/dashboard/app/actions/auth.ts`, `lib/session.ts`, `proxy.ts` |

Across services, the trace context travels in the `x-trace-id` and `x-span-id` HTTP headers (`tracer.injectHeaders()` on the caller, `tracer.extractContext()` on the receiver). See `apps/demo-app` for an example.

## Repo layout

```
apps/
  collector/      Express API: POST /ingest, GET /traces, GET /traces/:id
  worker/         RabbitMQ consumer that writes spans to PostgreSQL, plus the SQL migrations
  dashboard/      Next.js app (waterfall chart, login)
  demo-app/       order, inventory and payment services that use the SDK
packages/sdk/     @yashshukla/observeiq-node
scripts/          migrate.ts (runs the SQL migrations), mock-emitter.ts (sends fake traces)
docs/             design notes
docker-compose.yml        local PostgreSQL and RabbitMQ
docker-compose.prod.yml   collector and worker containers
```

Stack: TypeScript, Node.js 24, Express 5, RabbitMQ (amqplib), PostgreSQL, Next.js 16, Tailwind, jose and bcryptjs for login.

## Run it locally

You need Node.js 24 and Docker.

```bash
git clone https://github.com/yash-shukla-git/observeiq.git
cd observeiq
npm install
npm run build:sdk          # the demo services import the SDK from packages/sdk/dist
cp .env.example .env       # the defaults match docker-compose.yml
cp apps/dashboard/.env.example apps/dashboard/.env.local
```

Open `apps/dashboard/.env.local` and set `SESSION_SECRET` (at least 32 characters, for example from `openssl rand -base64 32`).

Start PostgreSQL and RabbitMQ, then create the tables:

```bash
docker compose up -d
npm run migrate
```

Start the services, each in its own terminal:

```bash
npm run collector
npm run worker
npm run dashboard          # http://localhost:3000
```

Open http://localhost:3000, sign up, and you are in. To get traces in:

```bash
npm run emit               # sends a fake 3-span trace (TRACES=5 npm run emit for more)
```

Or run the demo services (three more terminals) and place orders:

```bash
npm run payment
npm run inventory
npm run order

curl -X POST localhost:3001/order -H 'content-type: application/json' -d '{}'
curl -X POST localhost:3001/order -H 'content-type: application/json' -d '{"sku":"SKU-999"}'   # fails on purpose
```

RabbitMQ has a management page at http://localhost:15672 (user and password `guest`).

## Environment variables

Root `.env` (collector, worker, demo services, migrate script):

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | `true` for Neon. Leave `false` for local PostgreSQL |
| `RABBITMQ_URL` | `amqp://...` locally, `amqps://...` for CloudAMQP |
| `QUEUE_NAME` | Queue for spans, default `spans`. The dead letter queue is `<name>.dlq` |
| `COLLECTOR_PORT` | Collector port, default 4318. Not named `PORT` on purpose, Next.js reads `PORT` |
| `COLLECTOR_URL` | Where the demo services and mock emitter send spans |
| `INGEST_API_KEY` | If set, `/ingest` needs a matching `x-api-key` header. Empty means open |
| `CORS_ORIGIN` | Browser origin allowed to call the collector. Default allows any |

Dashboard `apps/dashboard/.env.local`: `NEXT_PUBLIC_COLLECTOR_URL`, `DATABASE_URL`, `DATABASE_SSL`, `SESSION_SECRET`, `ALLOW_SIGNUP`. The dashboard needs `DATABASE_URL` because user accounts are stored in the same database.

## Using the SDK

```ts
import { Tracer } from '@yashshukla/observeiq-node';

const tracer = new Tracer({
  serviceName: 'order-service',
  collectorUrl: 'http://localhost:4318',   // the SDK adds /ingest itself
  apiKey: process.env.INGEST_API_KEY,      // only needed if the collector has a key
});

await tracer.trace('createOrder', async () => {
  await tracer.trace('saveToDb', async () => { /* ... */ });   // becomes a child span
});
```

More in [packages/sdk/README.md](./packages/sdk/README.md).

## Collector API

| Endpoint | What it does |
|---|---|
| `POST /ingest` | One span or an array of up to 100. Returns 202 when queued, 400 with a reason when a span is invalid, 401 with a wrong API key |
| `GET /traces` | The latest 50 traces: root service, start time, duration, span count, has error |
| `GET /traces/:traceId` | All spans of one trace as a tree |
| `GET /health`, `GET /health/db` | Liveness and database check |

A trace's duration is the time from the first span start to the last span end. Summing span durations would count nested spans twice.

## Tests and CI

```bash
npm test             # unit tests (node:test via tsx)
npm run typecheck    # tsc for every package
npm run lint --workspace=dashboard
```

The tests cover the tree builder, span validation, the worker's decision on which database errors are retried, and the session token. GitHub Actions (`.github/workflows/ci.yml`) runs install, SDK build, typecheck, lint, tests, the dashboard build, and builds both Docker images. There is no automated end-to-end test of the whole pipeline yet, I check that by hand with the steps above.

## Deploying

Nothing is deployed right now. What the repo gives you:

- `docker-compose.prod.yml` runs the collector and worker. It expects managed services: Neon for PostgreSQL (`DATABASE_SSL=true`) and CloudAMQP for RabbitMQ. Run it with `docker compose -f docker-compose.prod.yml up -d --build` and put the URLs in `.env`.
- Run `npm run migrate` against the production database once, and again after pulling new migrations.
- Set `INGEST_API_KEY` on the collector and the same value in every service that uses the SDK. Set `CORS_ORIGIN` to the dashboard URL.
- The dashboard is a normal Next.js app (it was on Vercel before). The session cookie is marked `Secure`, so the dashboard has to be served over HTTPS. Set `ALLOW_SIGNUP=false` after creating your account.
- `next build` used around 500 MB of memory when I measured it on my laptop, so build on a bigger machine or add swap if you use a small server.

## Known limitations

- The SDK sends one HTTP request per span and does not retry. Spans are dropped if the collector is unreachable.
- `GET /traces` returns the latest 50 traces with no paging or search on the server.
- The read endpoints (`/traces`) are open. Only `/ingest` can be protected with a key.
- Login has no lockout after repeated wrong passwords and no password reset.
- Spans in `spans.dlq` are kept but there is no tool to inspect or replay them. Use the RabbitMQ management page.
- Node.js only.

## Design notes

Why things are built the way they are: [docs/design-notes.md](./docs/design-notes.md).

## License

MIT
