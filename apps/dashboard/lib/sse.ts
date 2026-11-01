export interface SseEvent {
    event: string;
    data: unknown;
}

// Server-Sent Events arrive in pieces. Give it everything received so far: it returns the complete
// events and the unfinished rest, which goes back in front of the next piece.
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
    const parts = buffer.split('\n\n');
    const rest = parts.pop() ?? '';
    const events: SseEvent[] = [];

    for (const part of parts) {
        let event = 'message';
        const data: string[] = [];
        for (const line of part.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trim());
        }
        if (data.length === 0) continue;
        try {
            events.push({ event, data: JSON.parse(data.join('\n')) });
        } catch {
            // a broken event is skipped, the stream goes on
        }
    }
    return { events, rest };
}
