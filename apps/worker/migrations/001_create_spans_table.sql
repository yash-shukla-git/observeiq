-- Migration: 001_create_spans_table.sql
-- Run this once against your PostgreSQL instance before starting the worker.
-- docker exec -i <postgres_container> psql -U postgres -d observeiq < migrations/001_create_spans_table.sql

CREATE TABLE IF NOT EXISTS spans (
                                     id            BIGSERIAL PRIMARY KEY,

    -- Trace identity
                                     trace_id      VARCHAR(36)  NOT NULL,
    span_id       VARCHAR(36)  NOT NULL UNIQUE,
    parent_span_id VARCHAR(36) NULL,      -- NULL = root span

-- Descriptive
    operation_name VARCHAR(255) NOT NULL,
    service_name   VARCHAR(255) NOT NULL,

    -- Timing (stored as bigint ms since epoch; easy to diff, no tz headaches)
    start_time    BIGINT       NOT NULL,
    duration      INTEGER      NOT NULL,  -- ms

-- Outcome
    status        VARCHAR(10)  NOT NULL CHECK (status IN ('ok', 'error')),
    error         TEXT         NULL,

    -- Flexible metadata
    tags          JSONB        NOT NULL DEFAULT '{}',

    -- Housekeeping
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

-- Queries you will run constantly on the dashboard
CREATE INDEX IF NOT EXISTS idx_spans_trace_id    ON spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service_name ON spans (service_name);
CREATE INDEX IF NOT EXISTS idx_spans_start_time  ON spans (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_status      ON spans (status) WHERE status = 'error';