// Postgres error codes starting with 22 (bad data, e.g. string too long) or 23 (constraint, e.g. null in a
// required column) fail the same way on every retry, so there is no point requeuing those messages.
export function isPermanentDbError(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === 'string' && (code.startsWith('22') || code.startsWith('23'));
}
