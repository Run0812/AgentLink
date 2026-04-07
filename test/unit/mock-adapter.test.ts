import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockAdapter } from '../../src/adapters/mock-adapter';
import { StreamHandlers } from '../../src/core/types';
import { CancellationError } from '../../src/core/errors';

describe('MockAdapter', () => {
	let adapter: MockAdapter;

	beforeEach(() => {
		adapter = new MockAdapter();
	});

	it('starts in disconnected state', () => {
		expect(adapter.getStatus().state).toBe('disconnected');
	});

	it('transitions to connected on connect()', async () => {
		await adapter.connect();
		expect(adapter.getStatus().state).toBe('connected');
	});

	it('transitions to disconnected on disconnect()', async () => {
		await adapter.connect();
		await adapter.disconnect();
		expect(adapter.getStatus().state).toBe('disconnected');
	});

	it('sends streaming chunks to onChunk handler', async () => {
		await adapter.connect();

		const chunks: string[] = [];
		let completedText = '';

		const handlers: StreamHandlers = {
			onChunk: (chunk) => chunks.push(chunk),
			onComplete: (text) => { completedText = text; },
			onError: () => {},
		};

		await adapter.sendMessage({ prompt: 'hello' }, handlers);

		// Should have received multiple chunks
		expect(chunks.length).toBeGreaterThan(3);
		// onComplete should have the full text
		expect(completedText).toBe(chunks.join(''));
		// State should be back to connected
		expect(adapter.getStatus().state).toBe('connected');
	});

	it('triggers onError when prompt contains "error"', async () => {
		await adapter.connect();

		let errorCaught: Error | null = null;

		const handlers: StreamHandlers = {
			onChunk: () => {},
			onComplete: () => {},
			onError: (err) => { errorCaught = err; },
		};

		await adapter.sendMessage({ prompt: 'please error out' }, handlers);

		expect(errorCaught).not.toBeNull();
		expect(errorCaught!.message).toContain('Mock error');
	});

	it('can be cancelled mid-stream', async () => {
		await adapter.connect();

		const chunks: string[] = [];
		let errorCaught: Error | null = null;

		const handlers: StreamHandlers = {
			onChunk: (chunk) => {
				chunks.push(chunk);
				// Cancel after first chunk
				if (chunks.length === 1) {
					adapter.cancel();
				}
			},
			onComplete: () => {},
			onError: (err) => { errorCaught = err; },
		};

		await adapter.sendMessage({ prompt: 'hello' }, handlers);

		// Should have received at least 1 chunk but not all
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		expect(chunks.length).toBeLessThan(10);
		// Error should be a CancellationError
		expect(errorCaught).toBeInstanceOf(CancellationError);
	});

	it('echoes the user prompt at the end', async () => {
		await adapter.connect();

		let completedText = '';

		const handlers: StreamHandlers = {
			onChunk: () => {},
			onComplete: (text) => { completedText = text; },
			onError: () => {},
		};

		await adapter.sendMessage({ prompt: 'my test message' }, handlers);

		expect(completedText).toContain('my test message');
	});

	it('auto-connects if sendMessage is called while disconnected', async () => {
		const chunks: string[] = [];

		const handlers: StreamHandlers = {
			onChunk: (chunk) => chunks.push(chunk),
			onComplete: () => {},
			onError: () => {},
		};

		// Don't explicitly connect
		await adapter.sendMessage({ prompt: 'hello' }, handlers);

		expect(chunks.length).toBeGreaterThan(0);
	});
});
