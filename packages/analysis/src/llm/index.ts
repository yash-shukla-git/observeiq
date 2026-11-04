import { createGeminiProvider } from './gemini';
import { createOllamaProvider } from './ollama';
import type { LlmProvider } from './provider';

export type { LlmProvider, LlmRequest, LlmFailure } from './provider';
export { LlmError } from './provider';
export { createFakeProvider } from './fake';

type Env = Record<string, string | undefined>;

// AI_PROVIDER = gemini | ollama | none. Not set: gemini when a key exists, otherwise none.
// null means "no model", and the analysis then answers from the detectors alone.
export function providerFromEnv(env: Env): LlmProvider | null {
    const choice = env.AI_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'none');
    if (choice === 'gemini') {
        if (!env.GEMINI_API_KEY) return null;
        return createGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-3.5-flash-lite');
    }
    if (choice === 'ollama') {
        if (!env.OLLAMA_MODEL) return null;
        return createOllamaProvider(env.OLLAMA_URL || 'http://localhost:11434', env.OLLAMA_MODEL);
    }
    return null;
}

export function limitsFromEnv(env: Env): { perMinute: number; perDay: number } {
    return {
        perMinute: Number(env.AI_MAX_CALLS_PER_MINUTE) || 5,
        perDay: Number(env.AI_DAILY_LIMIT) || 100,
    };
}

export function timeoutFromEnv(env: Env): number {
    return Number(env.AI_TIMEOUT_MS) || 20_000;
}
