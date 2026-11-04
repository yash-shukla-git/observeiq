# Trace analysis: design notes

## What it is for

When a request is slow or failing, point at the service and operation that most likely caused it and say what to check next. It is one panel next to the waterfall chart. It is not the headline of the project.

## Why plain detectors

- A detector is a function, so it can be unit tested and run on every trace page view for free.
- Percentiles, counts and error rates are arithmetic. There is nothing to guess.
- With known faults and a deterministic method, "does it work?" has an honest answer (see the evaluation).

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

### What the panel shows (`detectorDiagnosis`, `AnalysisPanel.tsx`)

The findings with the likely cause marked, and a short list of what to check next for that kind of problem (fixed text per kind, in `fallback.ts`). Clicking a finding highlights its spans in the waterfall. The trace page runs the detectors on the server while rendering, wrapped so a failure cannot break the page.

## Fault injection and ground truth

The demo services can be put into a faulty state with `POST /__fault` when `ENABLE_FAULTS=true`: slow database queries, one query per item (N+1), a failing payment service, order retries, and a short client timeout. The inventory service records a `db.query` span, so a normal order trace has 6 spans.

The expected cause for each scenario is written only in `scripts/eval/scenarios.ts`. It is never written into spans, so the detectors cannot read it.

## Evaluation protocol (`npm run eval`)

For each scenario the harness empties the `spans` table (it refuses to run unless the database is on localhost), sends 60 normal orders (the baseline), switches the fault on, sends 30 more, then analyses evenly spaced traces from the fault period. The recent window is set to exactly the fault period and the baseline window to everything before it.

- **Variant a** is for building and tuning the detectors. **Variant b** uses different fault sizes (for example a 500 ms slowdown instead of 800 ms, 8 queries instead of 12). Reported numbers come from variant b, run after the thresholds were frozen. The threshold values were not changed after the first evaluation run. The only change made after seeing variant a results was the symptom rule described above.
- `healthy` is a control with no fault. Anything flagged there is a false positive.
- A trace counts as right when the picked finding names an expected service and operation (culprit), an expected kind, or both for the same expected answer (exact). The retry scenario accepts two answers, the retries or the failing payment behind them. The N+1 scenario accepts the repeated query or the operation that calls it.

### Results

`npm run eval -- --variant b --traces 10`, 10 traces per scenario, file `docs/eval-results/2026-11-02T14-24-detector-b.json` (commit `158413f`, made with an older version of the command that also had a `--mode detector` option).

| Scenario | Culprit found | Exact |
|---|---|---|
| slow_db | 100% | 100% |
| n_plus_one | 100% | 100% |
| failing_downstream | 100% | 100% |
| retry_storm | 100% | 100% |
| timeout_cascade | 100% | 100% |
| healthy, falsely flagged | 0% | |

Limits: five synthetic faults plus a healthy control, 10 traces each, one run. The detectors were built around these kinds of faults, so this shows they work on them. It says nothing about problems they were not built for, or about real traffic.

## What I tried and removed: a language model for the explanation

An earlier version of this feature also sent a short, abstracted summary of each trace (spans renamed S1, S2, tags filtered, text shortened) to a language model (Gemini `gemini-3.5-flash-lite`) and asked for a written explanation in a fixed JSON format. Answers were validated against the summary, retried once, and replaced by the detector answer on failure. It had a cache, a rate limit and a timeout. It was evaluated against the same faults in three ways, on variant b, 10 traces per scenario, one run each (commit `158413f`):

| | Culprit found | Exact |
|---|---|---|
| Detectors only | 100% | 100% |
| Detectors + model | 100% | 78% |
| Model only, no detector findings | 94% | 46% |

- With the findings, the model could not improve the place, because the detectors already found it every time. Its exact score was lower mostly because it picked overlapping labels (for example "slow downstream call" for a failing service).
- Without the findings it was worse, with 3 of 60 calls unanswered in 60 s and a 90th percentile latency of 30 s.
- What it added was a written sentence and generic checks. In real use on a healthy trace it just restated the numbers it was given. Whether the text helps a person was never measured.

So it added cost, quota, a key to manage, a database table and a lot of code for no measured gain in diagnosis, and it was removed. The code and the full result files are in the git history (the merged pull requests `feat/analysis-llm`, `feat/analysis-dashboard` and `feat/analysis-real-model`, and the result files for commit `158413f`). Two things learned from the real calls are worth remembering if a model is ever added again: the Google SDK retries 429 and 5xx responses up to five times by default, which hides a rate limit behind a long wait, and one call took 611 seconds to give up despite a 20 s timeout because the client ignored the abort signal, so a timeout needs to be enforced by racing the call against a timer.
