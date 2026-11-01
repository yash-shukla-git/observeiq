// Limits match the column sizes in 001_create_spans_table.sql, so a span that passes
// here can always be inserted by the worker.
const MAX_ID_LENGTH = 36;
const MAX_NAME_LENGTH = 255;
const MAX_ERROR_LENGTH = 2000;
const MAX_TAGS = 20;
const MAX_TAG_VALUE_LENGTH = 500;
const MAX_INT = 2147483647; // duration is an INTEGER column

function isText(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

// Returns a short reason when the span is bad, or null when it is fine.
export function validateSpan(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'span must be an object';
    const s = body as Record<string, unknown>;

    if (!isText(s.traceId, MAX_ID_LENGTH)) return 'traceId must be a string of 1-36 characters';
    if (!isText(s.spanId, MAX_ID_LENGTH)) return 'spanId must be a string of 1-36 characters';
    if (s.parentSpanId !== null && !isText(s.parentSpanId, MAX_ID_LENGTH)) {
        return 'parentSpanId must be null or a string of 1-36 characters';
    }
    if (!isText(s.operationName, MAX_NAME_LENGTH)) return 'operationName must be a string of 1-255 characters';
    if (!isText(s.serviceName, MAX_NAME_LENGTH)) return 'serviceName must be a string of 1-255 characters';

    if (!Number.isInteger(s.startTime) || (s.startTime as number) < 0) return 'startTime must be a non-negative integer';
    if (!Number.isInteger(s.duration) || (s.duration as number) < 0 || (s.duration as number) > MAX_INT) {
        return 'duration must be a non-negative integer';
    }
    if (s.status !== 'ok' && s.status !== 'error') return 'status must be ok or error';

    if (s.error !== undefined && !(typeof s.error === 'string' && s.error.length <= MAX_ERROR_LENGTH)) {
        return 'error must be a string of at most 2000 characters';
    }

    if (s.tags !== undefined) {
        if (typeof s.tags !== 'object' || s.tags === null || Array.isArray(s.tags)) return 'tags must be an object';
        const entries = Object.entries(s.tags);
        if (entries.length > MAX_TAGS) return 'too many tags (max 20)';
        for (const [key, value] of entries) {
            const okType = typeof value === 'number' || typeof value === 'boolean' ||
                (typeof value === 'string' && value.length <= MAX_TAG_VALUE_LENGTH);
            if (key.length > MAX_NAME_LENGTH || !okType) return `tag "${key.slice(0, 40)}" has an invalid key or value`;
        }
    }

    return null;
}
