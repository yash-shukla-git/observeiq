import type { Pool } from 'pg';
import type { AnalysisResult } from './diagnose';

export interface RunRecord {
    traceId: string;
    evidenceHash: string;
    provider: string;
    model: string;
    status: 'ok' | 'fallback' | 'error';
    attempts: number;
    latencyMs: number;
    result: AnalysisResult | null;
    error: string | null;
}

// Kept as an interface so the tests can use an in-memory version
export interface AnalysisStore {
    findCached(traceId: string, evidenceHash: string, provider: string, model: string): Promise<AnalysisResult | null>;
    countCalls(sinceMs: number): Promise<number>;
    save(run: RunRecord): Promise<void>;
}

export function pgStore(pool: Pool): AnalysisStore {
    return {
        async findCached(traceId, evidenceHash, provider, model) {
            const result = await pool.query(
                `SELECT result FROM analysis_runs
                 WHERE trace_id = $1 AND evidence_hash = $2 AND provider = $3 AND model = $4 AND status = 'ok'
                 ORDER BY id DESC LIMIT 1`,
                [traceId, evidenceHash, provider, model]
            );
            return result.rows[0]?.result ?? null;
        },

        // model calls made in the last sinceMs milliseconds (a rejected answer that was retried counts twice)
        async countCalls(sinceMs) {
            const result = await pool.query(
                `SELECT COALESCE(SUM(attempts), 0) AS n FROM analysis_runs
                 WHERE created_at > NOW() - ($1::double precision * INTERVAL '1 millisecond')`,
                [sinceMs]
            );
            return Number(result.rows[0].n);
        },

        async save(run) {
            await pool.query(
                `INSERT INTO analysis_runs
                   (trace_id, evidence_hash, provider, model, status, attempts, latency_ms, result, error)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    run.traceId, run.evidenceHash, run.provider, run.model, run.status,
                    run.attempts, run.latencyMs, run.result ? JSON.stringify(run.result) : null, run.error,
                ]
            );
        },
    };
}
