export interface LlmRequest {
    system: string;
    user: string;
    schema: unknown; // JSON schema of the answer
    signal: AbortSignal;
}

// A provider turns a request into the model's text answer. Everything else
// (prompt, validation, retry, cache) is the same for every provider.
export interface LlmProvider {
    name: string;
    model: string;
    generate(request: LlmRequest): Promise<string>;
}

export type LlmFailure = 'rate_limited' | 'timeout' | 'unavailable' | 'error';

export class LlmError extends Error {
    constructor(public reason: LlmFailure, message: string) {
        super(message);
    }
}

// Turns whatever a client library threw into one of our few reasons.
export function toLlmError(err: unknown): LlmError {
    if (err instanceof LlmError) return err;
    const status = (err as { status?: number })?.status;
    const name = (err as { name?: string })?.name;
    const message = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || name === 'TimeoutError') return new LlmError('timeout', 'request timed out');
    if (status === 429) return new LlmError('rate_limited', message);
    if (typeof status === 'number' && status >= 500) return new LlmError('unavailable', message);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) return new LlmError('unavailable', message);
    return new LlmError('error', message);
}
