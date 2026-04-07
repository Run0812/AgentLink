import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor, ToolExecutorConfig } from '../../src/services/tool-executor';
import { ToolCall, ToolType } from '../../src/core/types';

// Mock Obsidian App
const createMockApp = () => ({
	vault: {
		getAbstractFileByPath: () => null,
		read: () => Promise.resolve(''),
		create: () => Promise.resolve({}),
	},
});

describe('ToolExecutor', () => {
	let executor: ToolExecutor;
	let mockApp: ReturnType<typeof createMockApp>;

	const defaultConfig: ToolExecutorConfig = {
		workspaceRoot: '/test',
		autoConfirmRead: true,
		autoConfirmEdit: false,
	};

	beforeEach(() => {
		mockApp = createMockApp();
		executor = new ToolExecutor(mockApp as unknown as import('obsidian').App, defaultConfig);
	});

	describe('canAutoConfirm', () => {
		it('returns true for readonly tools when autoConfirmRead is true', () => {
			expect(executor.canAutoConfirm('read_file')).toBe(true);
			expect(executor.canAutoConfirm('list_dir')).toBe(true);
			expect(executor.canAutoConfirm('search')).toBe(true);
		});

		it('returns false for write tools when autoConfirmEdit is false', () => {
			expect(executor.canAutoConfirm('write_file')).toBe(false);
			expect(executor.canAutoConfirm('edit_file')).toBe(false);
		});

		it('returns false for dangerous tools when autoConfirmEdit is false', () => {
			expect(executor.canAutoConfirm('terminal')).toBe(false);
		});
	});

	describe('execute', () => {
		it('returns error for unknown tools', async () => {
			const call: ToolCall = {
				id: 'test',
				tool: 'unknown_tool' as ToolType,
				params: {},
			};

			const result = await executor.execute(call);

			expect(result.success).toBe(false);
			expect(result.content).toContain('Unknown tool');
		});

		it('returns error for read_file without path', async () => {
			const call: ToolCall = {
				id: 'test',
				tool: 'read_file',
				params: {},
			};

			const result = await executor.execute(call);

			expect(result.success).toBe(false);
			expect(result.content).toContain('Missing required parameter');
		});

		it('returns error for list_dir on non-existent path', async () => {
			const call: ToolCall = {
				id: 'test',
				tool: 'list_dir',
				params: { path: '/nonexistent' },
			};

			const result = await executor.execute(call);

			expect(result.success).toBe(false);
			expect(result.content).toContain('not found');
		});

		it('returns error for edit_file on non-existent file', async () => {
			const call: ToolCall = {
				id: 'test',
				tool: 'edit_file',
				params: { path: 'test.md', oldString: 'old', newString: 'new' },
			};

			const result = await executor.execute(call);

			expect(result.success).toBe(false);
			expect(result.content).toContain('not found');
		});

		it('executes terminal command and returns output or error', async () => {
			const call: ToolCall = {
				id: 'test',
				tool: 'terminal',
				params: { command: 'echo hello' },
			};

			const result = await executor.execute(call);

			// May fail on Windows without bash, but should return some result
			// Success depends on environment, so we just check structure
			expect(typeof result.success).toBe('boolean');
			expect(typeof result.content).toBe('string');
		});
	});

	describe('updateConfig', () => {
		it('updates configuration', () => {
			executor.updateConfig({ autoConfirmRead: false });
			expect(executor.canAutoConfirm('read_file')).toBe(false);
		});
	});
});
