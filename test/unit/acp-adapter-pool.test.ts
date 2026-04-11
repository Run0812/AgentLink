import { describe, expect, it, vi } from 'vitest';
import type { AcpBridgeAdapter, AcpBridgeAdapterConfig } from '../../src/adapters/acp-bridge-adapter';
import { AcpAdapterPool } from '../../src/services/acp-adapter-pool';

function createConfig(id: string, command: string = 'agent'): AcpBridgeAdapterConfig {
	return {
		type: 'acp-bridge',
		id,
		name: id,
		command,
		args: ['acp'],
	};
}

describe('AcpAdapterPool', () => {
	it('reuses the same adapter while the backend signature stays the same', async () => {
		const createAdapterMock = vi.fn((config: AcpBridgeAdapterConfig) => ({
			config,
			disconnect: vi.fn().mockResolvedValue(undefined),
		}));
		const createAdapter = (config: AcpBridgeAdapterConfig): AcpBridgeAdapter =>
			createAdapterMock(config) as unknown as AcpBridgeAdapter;

		const pool = new AcpAdapterPool({ createAdapter });
		const first = await pool.getOrCreate(createConfig('a'));
		const second = await pool.getOrCreate(createConfig('a'));

		expect(first).toBe(second);
		expect(createAdapterMock).toHaveBeenCalledTimes(1);
	});

	it('recreates the adapter when the backend signature changes', async () => {
		const firstDisconnect = vi.fn().mockResolvedValue(undefined);
		const secondDisconnect = vi.fn().mockResolvedValue(undefined);
		const createAdapterMock = vi
			.fn()
			.mockImplementationOnce((config: AcpBridgeAdapterConfig) => ({ config, disconnect: firstDisconnect }))
			.mockImplementationOnce((config: AcpBridgeAdapterConfig) => ({ config, disconnect: secondDisconnect }));
		const createAdapter = (config: AcpBridgeAdapterConfig): AcpBridgeAdapter =>
			createAdapterMock(config) as unknown as AcpBridgeAdapter;

		const pool = new AcpAdapterPool({ createAdapter });
		const first = await pool.getOrCreate(createConfig('a', 'agent-a'));
		const second = await pool.getOrCreate(createConfig('a', 'agent-b'));

		expect(first).not.toBe(second);
		expect(firstDisconnect).toHaveBeenCalledTimes(1);
		expect(createAdapterMock).toHaveBeenCalledTimes(2);
	});

	it('evicts inactive adapters after the configured TTL but keeps the active one', async () => {
		let now = 0;
		const disconnectA = vi.fn().mockResolvedValue(undefined);
		const disconnectB = vi.fn().mockResolvedValue(undefined);
		const createAdapterMock = vi
			.fn()
			.mockImplementationOnce((config: AcpBridgeAdapterConfig) => ({ config, disconnect: disconnectA }))
			.mockImplementationOnce((config: AcpBridgeAdapterConfig) => ({ config, disconnect: disconnectB }));
		const createAdapter = (config: AcpBridgeAdapterConfig): AcpBridgeAdapter =>
			createAdapterMock(config) as unknown as AcpBridgeAdapter;

		const pool = new AcpAdapterPool({ createAdapter, now: () => now });
		await pool.getOrCreate(createConfig('a'));
		now = 1_000;
		await pool.getOrCreate(createConfig('b'));
		now = 12_000;

		await pool.evictExpired(5_000, 'b', new Set(['a', 'b']));

		expect(disconnectA).toHaveBeenCalledTimes(1);
		expect(disconnectB).not.toHaveBeenCalled();
		expect(pool.getCachedBackendIds()).toEqual(['b']);
	});
});
