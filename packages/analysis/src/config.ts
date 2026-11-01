import type { AnalysisConfig } from './types';

export const defaultConfig: AnalysisConfig = {
    recentMs: 5 * 60_000,
    baselineMs: 60 * 60_000,
    anchorMs: null,
    minSamples: 20,
    regressionRatio: 2,
    regressionMinIncreaseMs: 50,
    errorMinCount: 5,
    errorMinRate: 0.1,
    errorRateRatio: 3,
    repeatMin: 5,
    retryMin: 3,
    slowRatio: 2,
    slowNoBaselineShare: 0.5,
    slowNoBaselineMinMs: 300,
};

export function resolveConfig(partial: Partial<AnalysisConfig> = {}): AnalysisConfig {
    return { ...defaultConfig, ...partial };
}
