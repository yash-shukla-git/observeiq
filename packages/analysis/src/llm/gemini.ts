import { GoogleGenAI } from '@google/genai';
import { LlmError, toLlmError, type LlmProvider } from './provider';

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
    const ai = new GoogleGenAI({ apiKey });

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
