# AI Analysis: design notes

Status: the detectors, the model layer and the dashboard panel are built. All three evaluation modes have been run for real against `gemini-3.5-flash-lite`. The results are in the last section.

## What it is for

When a request is slow or failing, point at the service and operation that most likely caused it and say what to check next. The feature is one part of ObserveIQ, next to the waterfall chart. It is not the project's headline.

## Why detectors first, and a model only for the explanation

Plain code finds the problems. A model is only asked to explain a small, already structured summary of what the code found.

- Detectors are functions, so they can be unit tested and run on every trace for free. Percentiles and counts are arithmetic, which is where models are least reliable.
- The model only sees an abstracted summary, never raw spans. Free-tier model providers may use submitted content to improve their products, so less data leaving the server is better.
- With known faults and a deterministic baseline, "does the model help?" has an honest answer. The evaluation compares both.

## Detectors (`packages/analysis/src/detectors`)

All thresholds are in `packages/analysis/src/config.ts`.

| Detector | Where it works | Rule |
|---|---|---|
| Latency regression | per service + operation, from the `spans` table | p99 of the recent window is at least 2x the baseline p99 and at least 50 ms higher, and both windows have at least 20 spans |
| Error spike | same query | at least 5 recent errors and a recent error rate of at least 10% and at least 3x the baseline rate |
| N+1 (repeated identical calls) | inside one trace | 5 or more sibling spans with the same parent, service and operation |
| Retry storm | inside one trace | 3 or more such siblings and at least half of them failed |
| Slow downstream | inside one trace | a call into another service that is at least 2x that operation's baseline p95 and at least 50 ms slower (or, with no baseline, at least 50% of the request and at least 300 ms) |

The window numbers come from one grouped query that uses `percentile_cont(...) WITHIN GROUP (...) FILTER (WHERE ...)` for the recent and the baseline window at once. The minimum sample size is there because a p99 of a handful of spans is just the maximum.

Every finding has a severity between 0 and 1. It is only used to order findings, it is not a probability.

### Picking the most likely cause

A finding is treated as a symptom when another finding has a span below one of its own spans. A slow database query makes the call that waits for it slow, and the request that made that call fail, so the deepest finding is the cause. Among the findings that are not symptoms, the highest severity wins (`detectors/primary.ts`). This only works because the SDK passes the trace context between services, so a callee's spans really are children of the caller's span.

The first version compared only one span per finding. In the retry scenario that ranked the wrong finding in one trace out of five, because the failing payment call sat under a different retry attempt than the span it was compared with. Comparing all spans of a finding fixed it. That was done on the tuning data (variant a), before the reported run.

## Evidence builder (`packages/analysis/src/evidence.ts`)

Turns an analysis into a summary of at most 25 spans (spans named in findings, failing spans, the largest self time, and their parents). Spans are renamed S1, S2, ... so an answer can only cite spans that exist, and the mapping back to real ids stays on the server. Only a few tags are kept (`http.method`, `http.status_code`, `db.system`, `db.statement`, `peer.service`), the statement is cut to 120 characters and error text to 200. The summary has a hash, used later as a cache key.

## Fault injection and ground truth

The demo services can be put into a faulty state with `POST /__fault` when `ENABLE_FAULTS=true`: slow database queries, one query per item (N+1), a failing payment service, order retries, and a short client timeout. The inventory service now records a `db.query` span, so a normal order trace has 6 spans.

The expected cause for each scenario is written only in `scripts/eval/scenarios.ts`. It is never written into spans, so neither the detectors nor a model can read it.

## Evaluation protocol (`npm run eval`)

For each scenario the harness empties the `spans` table, sends 60 normal orders (the baseline), switches the fault on, sends 30 more, then analyses evenly spaced traces from the fault period. The recent window is set to exactly the fault period and the baseline window to everything before it.

- **Variant a** is for building and tuning the detectors. **Variant b** uses different fault sizes (for example a 500 ms slowdown instead of 800 ms, 8 queries instead of 12). Reported numbers come from variant b, run after the thresholds were frozen, so they were not tuned on the data they are scored on. The threshold values were not changed after the first evaluation run. The only change made after seeing variant a results was the symptom rule described above.
- `healthy` is a control with no fault. Anything flagged there is a false positive.
- A trace counts as right when the picked finding names an expected service and operation (culprit), an expected kind, or both for the same expected answer (exact). The retry scenario accepts two answers, the retries or the failing payment behind them.

## The model layer (`packages/analysis/src/llm`, `prompt.ts`, `validate.ts`, `diagnose.ts`)

### Providers
A provider is one small interface, `generate({system, user, schema, signal})` that returns the model's text (`llm/provider.ts`). Two are written: Gemini (through Google's official SDK, `llm/gemini.ts`) and Ollama for local models (`llm/ollama.ts`, plain `fetch`). Everything else (prompt, validation, retry, cache) is shared, so adding a provider means adding one file. Tests use a fake provider that returns a fixed list of answers. `AI_PROVIDER` picks the provider, and with nothing configured the analysis answers from the detectors alone.

Facts taken from Google's documentation on 2026-11-01: the rate limit page gives no numbers for the free tier (they are shown per project in AI Studio), the stable low-cost models are `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` (the default is the first, set `GEMINI_MODEL` to change it), and content sent on the free tier may be used to improve Google's products. That last point is why the model only gets the abstracted evidence and never raw spans. The structured output options used by the SDK call (`responseMimeType`, `responseJsonSchema`) are marked deprecated in the SDK's types in favour of a newer `response_format`. They were checked against the live API with a real key: `gemini-3.5-flash-lite` accepted them and returned JSON that matched the schema. The answer is validated in our own code in any case.

Two things only showed up with real calls. The SDK retries 429 and 5xx responses up to 5 times with growing delays by default, which hid a rate limit behind a long wait, so its retries are turned off (`attempts: 1`) and `diagnose.ts` decides what to do with a failure. And one call took 611 seconds to give up although the timeout was 20 seconds, because the client library did not react to the abort signal in time. The timeout is now also enforced by racing the call against a timer (with a test using a provider that never answers).

### Answer format and validation
The model must answer with fixed JSON: `summary`, `root_cause` (kind, span_ref, service, operation), 1 to 5 `evidence` notes each pointing at a span, `confidence`, 1 to 3 `suggested_checks`. `validate.ts` checks the shape with zod, then checks that every cited span exists in the evidence and that the service and operation of the root cause match the span it cites. Rejected answers get one retry: the model is shown its own answer and the exact problems. After a second rejection the detector answer is returned. Length limits are checked here because the API does not enforce them.

### Cost and reliability
- Cache: results are stored in `analysis_runs` (migration 003), keyed by trace, evidence hash, provider and model. The same evidence is never sent twice.
- Rate limit: the number of model calls in the last minute and the last day is counted from the same table and compared with `AI_MAX_CALLS_PER_MINUTE` and `AI_DAILY_LIMIT`. Over the limit, the detector answer is returned and no call is made. It is stored in the database, so it also works on hosting where each request may run in a different process.
- Timeout: `AI_TIMEOUT_MS` (20 s), enforced with an abort signal.
- Failure: a 429, a server error, a network error or a timeout returns the detector answer with the reason (`fallbackReason`). Failures are not retried, because a retry would not help and would spend quota.
- A result always says where it came from (`source: llm | detector`), how many model calls it took, and why it fell back if it did.

### Tests
19 unit tests cover validation (invented span, mismatched service, bad JSON, wrong shapes, fenced JSON) and `diagnoseTrace` with a fake provider: valid answer mapped back to real span ids, real ids never sent to the model, retry after an invented span (and that the retry prompt names the problem), two rejections, provider failures, timeout, cache hit and cache off, rate limit, and the model-only arm hiding the findings.

### Pipeline check without a real model
The model path was run end to end against a stand-in HTTP server that speaks Ollama's protocol and answers by simple rules (not stored in the repo). Four traces went through the real Ollama provider, validation, the retry path (the stand-in cited a missing span on every fourth first attempt, one trace needed two calls), the database store, and the harness. With the model unreachable, the harness got the detector answer with `fallbackReason: unavailable`. This shows the plumbing works. It says nothing about how good a real model is, and no number from it is reported.

## Evaluation modes

`npm run eval -- --mode detector|llm|llm-only --variant b --traces 10`

- `detector`: the detectors alone (reported above).
- `llm`: detectors plus the model, which is the product. When the model is unavailable or rejected twice, the detector answer is what the user would see, and that is what gets scored.
- `llm-only`: the model sees the same compact span summary but not the detector findings. This answers "do we need the detectors at all?". An answer is only counted if it came from the model.
- Besides culprit/kind/exact accuracy the model modes record how often the model answered, how often on the first try, how often after a retry, how often it was rejected twice or unavailable, the median latency, and a rule-based check of whether the written explanation names the right service and operation. A second model is never used to judge.
- `--delay` (default 6 s) spaces out model calls so the evaluation stays under the project's free tier limits.

## Dashboard (`apps/dashboard`)

- **Where the logic lives:** `packages/analysis` is a library with no HTTP. The dashboard server calls it directly: the trace page runs the detectors while rendering (cheap, and wrapped so a failure cannot break the page), and `POST /api/analysis/[traceId]` runs the model part.
- **Why a route handler on the dashboard and not on the collector:** the collector's read endpoints are open and have no login. A model call spends quota, so it sits behind the dashboard's session check. The API key never leaves the dashboard server. `proxy.ts` skips `/api` paths, so the route checks the session itself. It is a POST because the session cookie is not sent on cross-site POSTs (`SameSite=Lax`), which stops another website from spending quota on a visitor's behalf.
- **Streaming:** the response is Server-Sent Events with stages: `status` (asking the model), then `result` (or `error`). Only the validated answer is ever sent, never partial model text. Streaming tokens would mean showing text before it has been checked against the evidence, which is the opposite of what the validation is for. `lib/sse.ts` parses the stream in the browser.
- **The panel** (`AnalysisPanel.tsx`) shows the detector findings immediately, with the likely cause marked, then the model answer when asked. Clicking a finding or a piece of evidence highlights the spans in the waterfall (`TraceView.tsx` holds the shared state). When the answer is the detector fallback, a banner says why.
- The package is TypeScript source, so `next.config.ts` lists it in `transpilePackages`.
- Checked end to end, first against the stand-in model server (with a screenshot of the page), then with the real key: unauthenticated POST gives 401, a bad trace id 400, an authenticated POST streams `status` then `result` (a real Gemini answer in about 2 s), a second call for the same trace is served from the cache, and with the daily cap exceeded (the evaluations had used 120 calls) the endpoint answered from the detectors with `rate_limited`. The key was read from the repo root `.env` through the fallback in `next.config.ts`. The visual layout was only checked with the stand-in answer.

## Results (real runs)

Variant b (fault sizes the detectors and the prompt were not tuned on), 10 traces per scenario, one run per mode, model `gemini-3.5-flash-lite`, commit `158413f`. Result files: `docs/eval-results/2026-11-02T14-24-detector-b.json`, `2026-11-02T14-51-llm-b.json`, `2026-11-02T16-24-llm-only-b.json`.

Commands: `npm run eval -- --mode detector --variant b --traces 10`, then the same with `--mode llm --delay 6000` and `--mode llm-only --delay 6000`. The evaluation uses a 60 s model timeout (`--timeout`) so it measures the model and not slow moments of the API. Calls above 20 s are counted separately because the product's default would have cut them off.

Each cell is "culprit found / exact" (culprit: right service and operation; exact: also the right kind, paired with the same place).

| Scenario | Detectors only | Detectors + model | Model only (no findings) |
|---|---|---|---|
| slow_db | 100% / 100% | 100% / 100% | 100% / 50% |
| n_plus_one | 100% / 100% | 100% / 100% | 100% / 100% |
| failing_downstream | 100% / 100% | 100% / 70% | 100% / 40% |
| retry_storm | 100% / 100% | 100% / 20% | 80% / 40% |
| timeout_cascade | 100% / 100% | 100% / 100% | 90% / 0% |
| **all 5 fault scenarios (50 traces)** | **100% / 100%** | **100% / 78%** | **94% / 46%** |
| healthy, falsely flagged (10 traces) | 0% | 0% | 0% |

Model behaviour (`--mode llm` / `--mode llm-only`):

| | detectors + model | model only |
|---|---|---|
| calls | 60 | 60 |
| answered | 60 | 57 (3 timed out at 60 s) |
| accepted on the first try | 60 | 57 |
| needed the retry / rejected twice | 0 / 0 | 0 / 0 |
| median / 90th percentile latency | 2.0 s / 6.6 s | 2.2 s / 30.0 s |
| calls above 20 s | 2 | 6 |
| explanation names the cause (rule check) | 98% | 92% |

What the model answered where it differed from the expected label (the model with findings):
- `failing_downstream`: 7 times "error spike at payment chargeCard" (expected), 3 times "slow downstream call at payment chargeCard".
- `retry_storm`: 8 times "retry storm at payment chargeCard", 2 times "error spike at payment chargeCard". The expected answers are retry storm at the order service's `processPayment` (the retries) or error spike at payment's `chargeCard`. Mixing the retry label with the payment service is neither, so it counts as culprit and kind right but not exact.
- `n_plus_one`: 8 times pointed at `checkInventory` (the calling operation), 2 times at `db.query`. Both count.
Without findings the model used "slow downstream call" for most slow-database cases (5 of 10 in `slow_db`, 9 of 9 answered in `timeout_cascade`), where the expected label is latency regression.

### How to read this

- Finding the place is solved by the detectors on these faults, so a model cannot improve that number. It matched them (100%) when it had the findings and was slightly worse (94%, with 3 unanswered) without them.
- The lower exact scores for the model come from label choices, and several labels overlap. They are real differences from the expected labels, and the scoring was not changed after the final runs, but they are not the same as "wrong diagnosis".
- The model's contribution is the written explanation and the suggested checks. This evaluation only checks by rule that the text names the right service and operation. It does not measure how useful the text is to a person. That would need people reading the answers.
- The detectors are what make the model dependable: with the findings every answer was valid on the first try and fast, without them there were timeouts and a 30 s tail.

### Limits and what was changed along the way

- Five synthetic faults plus a healthy control, 10 traces each, one run per mode, one model. Differences of a few traces are noise. Nothing here says how other models or real traffic would behave.
- Changes made after seeing the first model runs on the tuning variant (a), before the final runs on variant b: the rule that checks whether the explanation names the cause was made less literal; the N+1 scenario accepts the calling operation as well as the repeated query; the SDK retries were turned off and the timeout race was added. The prompt, the thresholds and the scoring were not changed after that.
- An earlier run of 18 model calls showed six 20 s timeouts. They were caused by the SDK's hidden retries and by slow moments of the API, which is how the two fixes above were found. Those runs are not reported.
