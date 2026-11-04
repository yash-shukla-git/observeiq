import { GoogleGenAI } from '@google/genai';
import { LlmError, toLlmError, type LlmProvider } from './provider';

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
    // The SDK retries 429 and 5xx up to 5 times with growing delays by default. That would hide a rate limit
    // behind a long wait, so retries are turned off here and diagnose.ts decides what to do with a failure.
    const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });

    return {
        name: 'gemini',
        model,
        async generate({ system, user, schema, signal }) {
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: user,
                    config: {
                        systemInstruction: system,
                        responseMimeType: 'application/json',
                        responseJsonSchema: schema,
                        temperature: 0.2,
                        abortSignal: signal,
                    },
                });
                const text = response.text;
                if (!text) throw new LlmError('error', 'the model returned no text');
                return text;
            } catch (err) {
                throw toLlmError(err);
            }
        },
    };
}
