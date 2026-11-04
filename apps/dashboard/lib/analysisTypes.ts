// What the trace page hands to the browser. Plain data only, no server code.
export interface FindingView {
    kind: string;
    service: string;
    operation: string;
    spanIds: string[];
    severity: number;
    message: string;
}

export interface AnalysisSummary {
    findings: FindingView[];
    primaryIndex: number | null; // the finding the detectors think is the cause
}
