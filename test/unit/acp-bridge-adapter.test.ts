import { describe, it, expect, beforeEach } from 'vitest';
import { AcpBridgeAdapter, AcpBridgeAdapterConfig } from '../../src/adapters/acp-bridge-adapter';

describe('AcpBridgeAdapter', () => {
	let adapter: AcpBridgeAdapter;

	const defaultConfig: AcpBridgeAdapterConfig = {
		type: 'acp-bridge',
		id: 'test-acp',
		name: 'Test ACP Agent',
		command: '',
		args: [],
	};

	beforeEach(() => {
		adapter = new AcpBridgeAdapter(defaultConfig);
	});

	describe('basic properties', () => {
		it('has correct id', () => {
			expect(adapter.id).toBe('acp-bridge');
		});

		it('has correct label', () => {
			expect(adapter.label).toBe('ACP Bridge');
		});
	});

	describe('getCapabilities', () => {
		it('returns expected capabilities', () => {
			const caps = adapter.getCapabilities();
			expect(caps).toContain('chat');
			expect(caps).toContain('file_read');
			expect(caps).toContain('file_write');
			expect(caps).toContain('file_edit');
			expect(caps).toContain('terminal');
		});
	});

	describe('getStatus', () => {
		it('returns disconnected initially', () => {
			const status = adapter.getStatus();
			expect(status.state).toBe('disconnected');
		});
	});

	describe('executeTool', () => {
		it('returns not implemented message', async () => {
			const result = await adapter.executeTool({
				id: 'test',
				tool: 'read_file',
				params: { path: 'test.md' },
			});

			expect(result.success).toBe(false);
			expect(result.content).toContain('ToolExecutor');
		});
	});

	describe('updateConfig', () => {
		it('updates configuration without errors', () => {
			adapter.updateConfig({ name: 'Updated Name' });
			// Config is private, but we can test no errors are thrown
		});
	});
});
