import { LlmError, type LlmProvider, type LlmRequest } from './provider';

// Answers from a fixed list, for tests. A string is returned, an LlmError is thrown.
export function createFakeProvider(answers: Array<string | LlmError>): LlmProvider & { requests: LlmRequest[] } {
    const requests: LlmRequest[] = [];
    let next = 0;
    return {
        name: 'fake',
        model: 'fake-model',
        requests,
        async generate(request) {
            requests.push(request);
            const answer = answers[Math.min(next++, answers.length - 1)];
            if (answer === undefined) throw new LlmError('error', 'no answer configured');
            if (answer instanceof LlmError) throw answer;
            return answer;
        },
    };
}
