import { LlmError, toLlmError, type LlmProvider } from './provider';

// Local models through Ollama's /api/chat. Nothing leaves the machine.
export function createOllamaProvider(baseUrl: string, model: string): LlmProvider {
    return {
        name: 'ollama',
        model,
        async generate({ system, user, schema, signal }) {
            try {
                const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: system },
                            { role: 'user', content: user },
                        ],
                        stream: false,
                        format: schema, // Ollama accepts a JSON schema here
                        options: { temperature: 0.2 },
                    }),
                    signal,
                });
                if (!response.ok) {
                    throw Object.assign(new Error(`ollama returned ${response.status}`), { status: response.status });
                }
                const body = (await response.json()) as { message?: { content?: string } };
                const text = body.message?.content;
                if (!text) throw new LlmError('error', 'the model returned no text');
                return text;
            } catch (err) {
                throw toLlmError(err);
            }
        },
    };
}
