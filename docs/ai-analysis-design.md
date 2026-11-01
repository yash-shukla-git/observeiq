# AI Analysis: design notes

Status: the detectors and the model layer are built. The detector-only result is measured. The model runs need a Gemini API key and are still to be run (see the end of this file). The dashboard panel comes last and is added here when it lands.

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

### Detector-only result

Command: `npm run eval -- --mode detector --variant b --traces 10`
Result file: `docs/eval-results/2026-11-01T12-19-detector-b.json` (commit `7437a85`)

| Scenario | Traces | Flagged | Culprit | Kind | Exact |
|---|---|---|---|---|---|
| healthy | 10 | 0% | 0% | 0% | 0% |
| slow_db | 10 | 100% | 100% | 100% | 100% |
| n_plus_one | 10 | 100% | 100% | 100% | 100% |
| failing_downstream | 10 | 100% | 100% | 100% | 100% |
| retry_storm | 10 | 100% | 100% | 100% | 100% |
| timeout_cascade | 10 | 100% | 100% | 100% | 100% |

Fault traces: 50, culprit 100%, exact 100%. Healthy traces: 10, falsely flagged 0%. (For `healthy` the culprit, kind and exact columns are 0% by definition, there is nothing to find.)

### How to read this result

It is a strong baseline on easy cases, not proof that the detectors work in general. The faults are synthetic and large, there are six scenarios, 10 traces each, one run, and the false positive rate comes from only 10 healthy traces. The detectors would be weaker on small slowdowns, noisy production traffic, or problems that have no detector. Because the baseline already scores 100% on culprit accuracy, a model cannot improve that number here. What a model can add is the written explanation and the next checks, and that is judged separately.

## The model layer (`packages/analysis/src/llm`, `prompt.ts`, `validate.ts`, `diagnose.ts`)

### Providers
A provider is one small interface, `generate({system, user, schema, signal})` that returns the model's text (`llm/provider.ts`). Two are written: Gemini (through Google's official SDK, `llm/gemini.ts`) and Ollama for local models (`llm/ollama.ts`, plain `fetch`). Everything else (prompt, validation, retry, cache) is shared, so adding a provider means adding one file. Tests use a fake provider that returns a fixed list of answers. `AI_PROVIDER` picks the provider, and with nothing configured the analysis answers from the detectors alone.

Facts taken from Google's documentation on 2026-11-01: the rate limit page gives no numbers for the free tier (they are shown per project in AI Studio), the stable low-cost models are `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` (the default is the first, set `GEMINI_MODEL` to change it), and content sent on the free tier may be used to improve Google's products. That last point is why the model only gets the abstracted evidence and never raw spans. The structured output options used by the SDK call (`responseMimeType`, `responseJsonSchema`) are marked deprecated in the SDK's types in favour of a newer `response_format`. They are not verified against the live API yet. The answer is validated in our own code in any case, so a provider ignoring the schema would only cost a retry.

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

### Still to run
The real model runs (`--mode llm` and `--mode llm-only`, variant b) need `GEMINI_API_KEY` in the untracked `.env`. Their results and the comparison table are added here once they exist.
