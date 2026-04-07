import { describe, it, expect, beforeEach } from 'vitest';
import { AcpBridgeAdapter, AcpBridgeAdapterConfig } from '../../src/adapters/acp-bridge-adapter';

describe('AcpBridgeAdapter', () => {
	let adapter: AcpBridgeAdapter;

	const defaultConfig: AcpBridgeAdapterConfig = {
		bridgeCommand: '',
		bridgeArgs: [],
		acpServerURL: 'http://localhost:8080',
		workspaceRoot: '/test',
		env: {},
		timeoutMs: 120000,
		autoConfirmTools: false,
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
		it('returns not implemented (Phase 3)', async () => {
			const result = await adapter.executeTool({
				id: 'test',
				tool: 'read_file',
				params: { path: 'test.md' },
			});

			expect(result.success).toBe(false);
			expect(result.content).toContain('not yet implemented');
		});
	});

	describe('updateConfig', () => {
		it('updates configuration', () => {
			adapter.updateConfig({ timeoutMs: 5000 });
			// Config is private, but we can test behavior changes
			// For now, just ensure no errors
		});
	});
});
