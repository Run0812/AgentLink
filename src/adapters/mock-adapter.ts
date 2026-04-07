/* ────────────────────────────────────────────────────────────────────────
 * MockAdapter — fake backend for UI development & testing.
 *
 * Simulates streaming output without any real AI model.
 * ──────────────────────────────────────────────────────────────────────── */

import { AgentAdapter, AgentInput, AgentStatus, AgentStatusState, StreamHandlers } from '../core/types';
import { CancellationError } from '../core/errors';
import { logger } from '../core/logger';

const MOCK_CHUNKS = [
	'Hello! ',
	'I am a **mock** agent. ',
	'This response is streamed ',
	'chunk by chunk to simulate ',
	'a real AI backend.\n\n',
	'You can use me to verify ',
	'that the UI works correctly ',
	'without needing any real model.',
];

export class MockAdapter implements AgentAdapter {
	readonly id = 'mock';
	readonly label = 'Mock Agent';

	private state: AgentStatusState = 'disconnected';
	private cancelled = false;
	private currentTimer: ReturnType<typeof setTimeout> | null = null;

	async connect(): Promise<void> {
		this.state = 'connecting';
		logger.debug('MockAdapter: connecting…');
		// Simulate a small connection delay
		await this.sleep(200);
		this.state = 'connected';
		logger.info('MockAdapter: connected');
	}

	async disconnect(): Promise<void> {
		await this.cancel();
		this.state = 'disconnected';
		logger.info('MockAdapter: disconnected');
	}

	async sendMessage(input: AgentInput, handlers: StreamHandlers): Promise<void> {
		if (this.state !== 'connected') {
			await this.connect();
		}

		this.cancelled = false;
		this.state = 'busy';
		logger.debug('MockAdapter: sendMessage', input.prompt);

		// If the prompt contains the word "error", simulate an error
		if (input.prompt.toLowerCase().includes('error')) {
			this.state = 'connected';
			handlers.onError(new Error('Mock error: you asked for it!'));
			return;
		}

		let accumulated = '';

		try {
			for (const chunk of MOCK_CHUNKS) {
				if (this.cancelled) {
					throw new CancellationError();
				}
				// Simulate network latency between chunks
				await this.sleep(150 + Math.random() * 200);
				if (this.cancelled) {
					throw new CancellationError();
				}
				accumulated += chunk;
				handlers.onChunk(chunk);
			}

			// Echo the user prompt back as final line
			const echo = `\n\n> You said: "${input.prompt}"`;
			accumulated += echo;
			handlers.onChunk(echo);

			this.state = 'connected';
			handlers.onComplete(accumulated);
		} catch (err) {
			this.state = 'connected';
			if (err instanceof CancellationError) {
				handlers.onError(err);
			} else {
				handlers.onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	async cancel(): Promise<void> {
		logger.debug('MockAdapter: cancel requested');
		this.cancelled = true;
		if (this.currentTimer !== null) {
			clearTimeout(this.currentTimer);
			this.currentTimer = null;
		}
	}

	getStatus(): AgentStatus {
		return { state: this.state };
	}

	// ── Helpers ────────────────────────────────────────────────────────

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			this.currentTimer = setTimeout(() => {
				this.currentTimer = null;
				resolve();
			}, ms);
		});
	}
}
