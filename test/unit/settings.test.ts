import { describe, it, expect } from 'vitest';
import {
	createKimiBackendConfig,
	createAcpBridgeBackendConfig,
	isValidBackendId,
	generateBackendId,
	enrichBackendsFromRegistry,
} from '../../src/settings/settings';

describe('createKimiBackendConfig', () => {
	it('creates Kimi backend with correct command and args', () => {
		const config = createKimiBackendConfig();
		expect(config.type).toBe('acp-bridge');
		expect(config.id).toBe('kimi');
		expect(config.command).toBe('kimi');
		expect(config.args).toEqual(['acp']);
		expect(config.registryAgentId).toBe('kimi');
	});
});

describe('createAcpBridgeBackendConfig', () => {
	it('creates config with provided values', () => {
		const config = createAcpBridgeBackendConfig('test-id', 'Test Agent', 'my-agent', ['--arg1', '--arg2'], 'registry-id');
		expect(config.type).toBe('acp-bridge');
		expect(config.id).toBe('test-id');
		expect(config.name).toBe('Test Agent');
		expect(config.command).toBe('my-agent');
		expect(config.args).toEqual(['--arg1', '--arg2']);
		expect(config.registryAgentId).toBe('registry-id');
	});

	it('creates config with default values when optional params omitted', () => {
		const config = createAcpBridgeBackendConfig();
		expect(config.type).toBe('acp-bridge');
		expect(config.id).toMatch(/^acp-/);
		expect(config.name).toBe('ACP Bridge');
		expect(config.command).toBe('');
		expect(config.args).toEqual([]);
	});
});

describe('isValidBackendId', () => {
	it('returns true for valid IDs', () => {
		expect(isValidBackendId('my-backend')).toBe(true);
		expect(isValidBackendId('my_backend')).toBe(true);
		expect(isValidBackendId('my-backend-123')).toBe(true);
		expect(isValidBackendId('a')).toBe(true);
	});

	it('returns false for invalid IDs', () => {
		expect(isValidBackendId('')).toBe(false);
		expect(isValidBackendId('my backend')).toBe(false);
		expect(isValidBackendId('my.backend')).toBe(false);
		expect(isValidBackendId('my@backend')).toBe(false);
	});
});

describe('generateBackendId', () => {
	it('generates acp-bridge ID with prefix', () => {
		const id = generateBackendId('acp-bridge');
		expect(id).toMatch(/^acp-\d+/);
	});
});

describe('enrichBackendsFromRegistry', () => {
	it('backfills icon and version for existing registry backend', () => {
		const backends = [createKimiBackendConfig()];
		const result = enrichBackendsFromRegistry(backends, {
			version: '1',
			agents: [
				{
					id: 'kimi',
					name: 'Kimi Code',
					version: '1.2.3',
					description: 'Kimi agent',
					icon: 'https://cdn.example.com/kimi.svg',
					distribution: {
						npx: {
							package: '@acme/kimi',
						},
					},
				},
			],
		});

		expect(result.changed).toBe(true);
		expect(result.backends[0].icon).toBe('https://cdn.example.com/kimi.svg');
		expect(result.backends[0].version).toBe('1.2.3');
		expect(result.backends[0].registryAgentId).toBe('kimi');
	});

	it('leaves backends unchanged when registry is missing', () => {
		const backends = [createAcpBridgeBackendConfig('manual', 'Manual', 'manual-agent', [])];
		const result = enrichBackendsFromRegistry(backends, null);

		expect(result.changed).toBe(false);
		expect(result.backends).toEqual(backends);
	});
});
