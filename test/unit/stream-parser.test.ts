import { describe, it, expect } from 'vitest';
import { parseSSEChunk, parseSSEBuffer } from '../../src/services/stream-parser';

describe('parseSSEChunk', () => {
	it('returns null for empty lines', () => {
		expect(parseSSEChunk('')).toBeNull();
		expect(parseSSEChunk('   ')).toBeNull();
	});

	it('returns null for SSE keep-alive (colon only)', () => {
		expect(parseSSEChunk(':')).toBeNull();
	});

	it('returns null for [DONE] signal', () => {
		expect(parseSSEChunk('data: [DONE]')).toBeNull();
	});

	it('returns null for event: lines', () => {
		expect(parseSSEChunk('event: message')).toBeNull();
	});

	it('parses OpenAI-style SSE delta content', () => {
		const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
		expect(parseSSEChunk(line)).toBe('Hello');
	});

	it('parses Ollama-style response field', () => {
		const line = 'data: {"response":"World"}';
		expect(parseSSEChunk(line)).toBe('World');
	});

	it('parses Ollama-style message.content field', () => {
		const line = 'data: {"message":{"content":"Hi"}}';
		expect(parseSSEChunk(line)).toBe('Hi');
	});

	it('returns raw payload for non-JSON SSE data', () => {
		expect(parseSSEChunk('data: plain text here')).toBe('plain text here');
	});

	it('returns null for JSON without recognized content fields', () => {
		expect(parseSSEChunk('data: {"id":"1234"}')).toBeNull();
	});

	it('returns plain text lines as-is (non-SSE)', () => {
		expect(parseSSEChunk('This is just text')).toBe('This is just text');
	});
});

describe('parseSSEBuffer', () => {
	it('splits buffer into text fragments and remainder', () => {
		const buffer =
			'data: {"choices":[{"delta":{"content":"A"}}]}\n' +
			'data: {"choices":[{"delta":{"content":"B"}}]}\n' +
			'data: {"choices":[{"delta":{"content":"C"}}';
		const result = parseSSEBuffer(buffer);
		expect(result.texts).toEqual(['A', 'B']);
		expect(result.remainder).toBe('data: {"choices":[{"delta":{"content":"C"}}');
	});

	it('handles empty buffer', () => {
		const result = parseSSEBuffer('');
		expect(result.texts).toEqual([]);
		expect(result.remainder).toBe('');
	});

	it('handles buffer with only newlines', () => {
		const result = parseSSEBuffer('\n\n');
		expect(result.texts).toEqual([]);
		expect(result.remainder).toBe('');
	});

	it('filters out [DONE] and keep-alive lines', () => {
		const buffer = 'data: {"choices":[{"delta":{"content":"X"}}]}\n:\ndata: [DONE]\n';
		const result = parseSSEBuffer(buffer);
		expect(result.texts).toEqual(['X']);
	});
});
