/* ────────────────────────────────────────────────────────────────────────
 * StreamParser — parse SSE and chunked-JSON streams into text deltas.
 *
 * Supports:
 *   1. OpenAI-style SSE  (`data: {"choices":[{"delta":{"content":"…"}}]}`)
 *   2. Plain-text lines  (returned as-is)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Parse a single SSE line and extract the text content.
 *
 * @returns The extracted text content, or `null` if the line should be
 *          skipped (e.g. keep-alive, `[DONE]`, comment, empty).
 */
export function parseSSEChunk(line: string): string | null {
	const trimmed = line.trim();

	// Empty lines / SSE keep-alives
	if (trimmed === '' || trimmed === ':') {
		return null;
	}

	// OpenAI-style SSE: "data: …"
	if (trimmed.startsWith('data:')) {
		const payload = trimmed.slice(5).trim();

		// Stream termination signal
		if (payload === '[DONE]') {
			return null;
		}

		try {
			const json = JSON.parse(payload);

			// OpenAI chat completion chunk
			if (json.choices?.[0]?.delta?.content !== undefined) {
				return json.choices[0].delta.content as string;
			}

			// Ollama-style: top-level "response" or "message.content"
			if (typeof json.response === 'string') {
				return json.response;
			}
			if (typeof json.message?.content === 'string') {
				return json.message.content;
			}

			// If JSON but no recognized content field → skip
			return null;
		} catch {
			// Not valid JSON — return raw payload as plain text
			return payload;
		}
	}

	// If the line starts with "event:" or is a SSE comment, skip it
	if (trimmed.startsWith('event:') || trimmed.startsWith(':')) {
		return null;
	}

	// Plain text fallback (non-SSE stream)
	return trimmed;
}

/**
 * Split a buffer that may contain multiple SSE events into individual
 * text fragments.  Useful when a single `data` event from fetch
 * contains multiple `\n`-separated lines.
 */
export function parseSSEBuffer(buffer: string): { texts: string[]; remainder: string } {
	const lines = buffer.split('\n');
	const remainder = lines.pop() ?? '';
	const texts: string[] = [];

	for (const line of lines) {
		const content = parseSSEChunk(line);
		if (content !== null) {
			texts.push(content);
		}
	}

	return { texts, remainder };
}
