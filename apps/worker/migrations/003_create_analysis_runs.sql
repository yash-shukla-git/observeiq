-- Migration: 003_create_analysis_runs.sql
-- One row per AI analysis attempt. Used as a cache (same evidence, same answer),
-- to count model calls for the rate limit, and as a record of what happened.

CREATE TABLE IF NOT EXISTS analysis_runs (
    id            BIGSERIAL PRIMARY KEY,
    trace_id      VARCHAR(36)  NOT NULL,
    evidence_hash VARCHAR(64)  NOT NULL,   -- sha256 of the evidence that was sent
    provider      VARCHAR(20)  NOT NULL,
    model         VARCHAR(80)  NOT NULL,
    status        VARCHAR(12)  NOT NULL CHECK (status IN ('ok', 'fallback', 'error')),
    attempts      INTEGER      NOT NULL,   -- model calls made, 2 when the first answer was rejected
    latency_ms    INTEGER      NOT NULL,
    result        JSONB        NULL,
    error         TEXT         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_lookup  ON analysis_runs (trace_id, evidence_hash);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_created ON analysis_runs (created_at);
