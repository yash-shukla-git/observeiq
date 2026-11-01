import type { FindingKind } from '@observeiq/analysis';

// What a person debugging the incident would name as the cause.
// This lives only here. It is never written into the spans, so detectors and models cannot read it.
export interface Expected {
    kind: FindingKind;
    service: string;
    operation: string;
}

export interface FaultSwitch {
    service: 'inventory' | 'order' | 'payment';
    body: Record<string, unknown>;
}

export type Variant = 'a' | 'b';

export interface Scenario {
    id: string;
    description: string;
    faults: (variant: Variant) => FaultSwitch[];
    expected: Expected[]; // any of these counts as correct. Empty means nothing should be flagged.
}

// Variant a is for building and tuning the detectors, variant b has different sizes and is used for the
// numbers that get reported, so the thresholds are not tuned on the data they are scored on.
const pick = <T>(variant: Variant, a: T, b: T) => (variant === 'a' ? a : b);

export const scenarios: Scenario[] = [
    {
        id: 'healthy',
        description: 'No fault. The control: nothing should be flagged.',
        faults: () => [],
        expected: [],
    },
    {
        id: 'slow_db',
        description: 'Every inventory db.query is much slower.',
        faults: (v) => [{ service: 'inventory', body: { type: 'slow_db', ms: pick(v, 800, 500) } }],
        expected: [{ kind: 'latency_regression', service: 'inventory-service', operation: 'db.query' }],
    },
    {
        id: 'n_plus_one',
        description: 'Inventory runs one db.query per item instead of one in total.',
        faults: (v) => [{ service: 'inventory', body: { type: 'n_plus_one', items: pick(v, 12, 8) } }],
        expected: [{ kind: 'n_plus_one', service: 'inventory-service', operation: 'db.query' }],
    },
    {
        id: 'failing_downstream',
        description: 'The payment service fails every charge.',
        faults: () => [{ service: 'payment', body: { type: 'failing_downstream' } }],
        expected: [{ kind: 'error_spike', service: 'payment-service', operation: 'chargeCard' }],
    },
    {
        id: 'retry_storm',
        description: 'Payment fails and the order service retries it several times.',
        faults: (v) => [
            { service: 'payment', body: { type: 'failing_downstream' } },
            { service: 'order', body: { type: 'retry_payment', attempts: pick(v, 5, 4) } },
        ],
        // both name the same incident: the retries and the failing payment behind them
        expected: [
            { kind: 'retry_storm', service: 'order-service', operation: 'processPayment' },
            { kind: 'error_spike', service: 'payment-service', operation: 'chargeCard' },
        ],
    },
    {
        id: 'timeout_cascade',
        description: 'Slow db plus a short client timeout: orders fail, but the cause is the db.',
        faults: (v) => [
            { service: 'inventory', body: { type: 'slow_db', ms: pick(v, 800, 600) } },
            { service: 'order', body: { type: 'client_timeout', ms: pick(v, 500, 400) } },
        ],
        expected: [{ kind: 'latency_regression', service: 'inventory-service', operation: 'db.query' }],
    },
];
