import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddedWebAdapter, EmbeddedWebAdapterConfig } from '../../src/adapters/embedded-web-adapter';

describe('EmbeddedWebAdapter', () => {
	let adapter: EmbeddedWebAdapter;

	const defaultConfig: EmbeddedWebAdapterConfig = {
		webURL: 'http://localhost:3000',
		timeoutMs: 120000,
	};

	beforeEach(() => {
		adapter = new EmbeddedWebAdapter(defaultConfig);
	});

	describe('basic properties', () => {
		it('has correct id', () => {
			expect(adapter.id).toBe('embedded-web');
		});

		it('has correct label', () => {
			expect(adapter.label).toBe('Embedded Web');
		});
	});

	describe('getCapabilities', () => {
		it('returns chat capability', () => {
			const caps = adapter.getCapabilities();
			expect(caps).toContain('chat');
		});
	});

	describe('getStatus', () => {
		it('returns disconnected initially', () => {
			const status = adapter.getStatus();
			expect(status.state).toBe('disconnected');
		});
	});

	describe('executeTool', () => {
		it('returns not implemented (Phase 4)', async () => {
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
			adapter.updateConfig({ webURL: 'http://localhost:8080' });
			// Config is private, but we can ensure no errors
		});
	});

	describe('iframe management', () => {
		it('createIframe returns iframe element', () => {
			// Skip in Node.js environment
			if (typeof document === 'undefined') {
				return;
			}
			const container = document.createElement('div');
			const iframe = adapter.createIframe(container);

			expect(iframe).toBeDefined();
			expect(iframe.tagName).toBe('IFRAME');
			expect(iframe.classList.contains('agentlink-embedded-web')).toBe(true);
		});

		it('destroyIframe removes iframe', () => {
			// Skip in Node.js environment
			if (typeof document === 'undefined') {
				return;
			}
			const container = document.createElement('div');
			adapter.createIframe(container);

			expect(container.querySelector('iframe')).not.toBeNull();

			adapter.destroyIframe();

			// After destroy, createIframe should need to be called again
			const iframe = adapter.createIframe(container);
			expect(iframe).toBeDefined();
		});
	});
});
