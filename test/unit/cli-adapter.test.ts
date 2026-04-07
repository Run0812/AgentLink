import { describe, it, expect, beforeEach } from 'vitest';
import { CliAdapter, CliAdapterConfig } from '../../src/adapters/cli-adapter';
import { StreamHandlers } from '../../src/core/types';
import { CommandNotFoundError, ProcessExitError } from '../../src/core/errors';
import * as path from 'path';

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

function makeConfig(overrides: Partial<CliAdapterConfig> = {}): CliAdapterConfig {
	return {
		command: 'node',
		args: [path.join(FIXTURE_DIR, 'mock-cli.js')],
		cwd: '',
		env: {},
		timeoutMs: 10000,
		...overrides,
	};
}

describe('CliAdapter', () => {
	let adapter: CliAdapter;

	beforeEach(() => {
		adapter = new CliAdapter(makeConfig());
	});

	it('starts in disconnected state', () => {
		expect(adapter.getStatus().state).toBe('disconnected');
	});

	it('can connect and disconnect', async () => {
		await adapter.connect();
		expect(adapter.getStatus().state).toBe('connected');
		await adapter.disconnect();
		expect(adapter.getStatus().state).toBe('disconnected');
	});

	it('streams stdout from the mock CLI', async () => {
		await adapter.connect();

		const chunks: string[] = [];
		let completedText = '';

		const handlers: StreamHandlers = {
			onChunk: (chunk) => chunks.push(chunk),
			onComplete: (text) => { completedText = text; },
			onError: () => {},
		};

		await adapter.sendMessage({ prompt: 'test input' }, handlers);

		expect(chunks.length).toBeGreaterThan(0);
		expect(completedText).toContain('mock CLI');
		expect(completedText).toContain('test input');
		expect(adapter.getStatus().state).toBe('connected');
	});

	it('reports error when CLI command writes to stderr and exits non-zero', async () => {
		await adapter.connect();

		let errorCaught: Error | null = null;

		const handlers: StreamHandlers = {
			onChunk: () => {},
			onComplete: () => {},
			onError: (err) => { errorCaught = err; },
		};

		await adapter.sendMessage({ prompt: 'error please' }, handlers);

		expect(errorCaught).toBeInstanceOf(ProcessExitError);
		expect(errorCaught!.message).toContain('Mock CLI error');
	});

	it('reports CommandNotFoundError for nonexistent command', async () => {
		adapter = new CliAdapter(makeConfig({ command: 'nonexistent_binary_xyz' }));
		await adapter.connect();

		let errorCaught: Error | null = null;

		const handlers: StreamHandlers = {
			onChunk: () => {},
			onComplete: () => {},
			onError: (err) => { errorCaught = err; },
		};

		await adapter.sendMessage({ prompt: 'hello' }, handlers);

		expect(errorCaught).toBeInstanceOf(CommandNotFoundError);
	});

	it('auto-connects if sendMessage called while disconnected', async () => {
		const chunks: string[] = [];

		const handlers: StreamHandlers = {
			onChunk: (chunk) => chunks.push(chunk),
			onComplete: () => {},
			onError: () => {},
		};

		await adapter.sendMessage({ prompt: 'hello' }, handlers);
		expect(chunks.length).toBeGreaterThan(0);
	});
});
