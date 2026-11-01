# Design notes

Short explanations of why parts of ObserveIQ work the way they do.

## Why a queue between the collector and the database

The collector only validates a span and publishes it to RabbitMQ, then answers 202. The worker writes to PostgreSQL at its own speed. If the database is slow or down, the services being traced are not slowed down, and spans wait in the queue (it is durable and messages are persistent). The cost is one more service to run, and a span shows up a moment after it was sent.

## Trace duration is first start to last end

`GET /traces` computes `MAX(start_time + duration) - MIN(start_time)`. The first version used `SUM(duration)`, which counts a child span again inside its parent: a 126 ms request showed up as 374 ms. The root service name is taken from the span with no parent, and if that span never arrived, from the earliest span.

## Validation limits match the database columns

`apps/collector/src/lib/validateSpan.ts` uses the same sizes as `001_create_spans_table.sql` (ids 36 characters, names 255, duration a 32-bit integer). A span that passes validation can always be inserted. Before this, a 300-character trace id passed the collector and then failed in the worker forever.

## The worker never retries messages that cannot succeed

PostgreSQL errors starting with `22` (bad data) or `23` (constraint) fail the same way every time (`apps/worker/src/errors.ts`). Those messages are copied to the `spans.dlq` queue with the error as a header, and the original is acknowledged. Other errors, like a lost connection, are requeued after a 2 second wait so a database outage does not turn into a tight loop. The dead letter queue is done in code instead of with RabbitMQ queue arguments, because changing the arguments of an existing queue makes RabbitMQ refuse to declare it, and the production queue already existed.

## Optional API key on /ingest

If `INGEST_API_KEY` is set, `/ingest` compares the `x-api-key` header with it using `timingSafeEqual`. If it is not set, ingest stays open so local development needs no setup. The key only protects writing spans. It does not protect reading, because the dashboard calls the collector from the browser and a key in browser code would not be secret.

## Login: signed cookie plus a check in the pages

Accounts are in a `users` table with bcrypt hashes. After login the server sets a cookie holding a JWT signed with `SESSION_SECRET` (HS256, 7 days, `HttpOnly`, `SameSite=lax`, `Secure` in production). There is no session table: the signature is the proof, so there is nothing to look up. The price is that a session cannot be revoked before it expires.

`proxy.ts` redirects visitors without a valid cookie to `/login`, which is fast because it runs before rendering. The pages also check the session themselves, because Next.js documents the proxy as an optimistic check and not the only protection. `lib/token.ts` has no `server-only` import because `proxy.ts` uses it too.

Login errors are the same for a wrong password and an unknown email, and an unknown email still runs one bcrypt comparison so both take about the same time.

## Migrations

`npm run migrate` (`scripts/migrate.ts`) applies the files in `apps/worker/migrations` in name order and records each in a `schema_migrations` table, inside a transaction per file. It is safe to run repeatedly. It replaced a `psql` one-liner that only knew about file 001.

## Ports and environment

The collector reads `COLLECTOR_PORT`, not `PORT`, because Next.js reads `PORT`. With both in one shared environment, the dashboard would try to bind the collector's port.
