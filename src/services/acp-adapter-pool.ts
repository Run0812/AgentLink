import type { AcpBridgeAdapter, AcpBridgeAdapterConfig } from '../adapters/acp-bridge-adapter';

interface CachedAdapterEntry {
	adapter: AcpBridgeAdapter;
	signature: string;
	lastUsedAt: number;
}

export interface AcpAdapterPoolOptions {
	createAdapter: (config: AcpBridgeAdapterConfig) => AcpBridgeAdapter;
	now?: () => number;
}

export class AcpAdapterPool {
	private readonly createAdapterFn: (config: AcpBridgeAdapterConfig) => AcpBridgeAdapter;
	private readonly now: () => number;
	private readonly entries = new Map<string, CachedAdapterEntry>();

	constructor(options: AcpAdapterPoolOptions) {
		this.createAdapterFn = options.createAdapter;
		this.now = options.now ?? (() => Date.now());
	}

	async getOrCreate(config: AcpBridgeAdapterConfig): Promise<AcpBridgeAdapter> {
		const signature = this.getSignature(config);
		const existing = this.entries.get(config.id);

		if (existing && existing.signature === signature) {
			existing.lastUsedAt = this.now();
			return existing.adapter;
		}

		if (existing) {
			await existing.adapter.disconnect().catch(() => {});
			this.entries.delete(config.id);
		}

		const adapter = this.createAdapterFn(config);
		this.entries.set(config.id, {
			adapter,
			signature,
			lastUsedAt: this.now(),
		});
		return adapter;
	}

	touch(backendId: string): void {
		const entry = this.entries.get(backendId);
		if (entry) {
			entry.lastUsedAt = this.now();
		}
	}

	async evictExpired(ttlMs: number, activeBackendId: string | null, validBackendIds?: Set<string>): Promise<void> {
		const now = this.now();

		for (const [backendId, entry] of this.entries) {
			if (backendId === activeBackendId) {
				continue;
			}

			if (validBackendIds && !validBackendIds.has(backendId)) {
				await entry.adapter.disconnect().catch(() => {});
				this.entries.delete(backendId);
				continue;
			}

			if (ttlMs === 0 || now - entry.lastUsedAt >= ttlMs) {
				await entry.adapter.disconnect().catch(() => {});
				this.entries.delete(backendId);
			}
		}
	}

	async shutdownAll(): Promise<void> {
		for (const [, entry] of this.entries) {
			await entry.adapter.disconnect().catch(() => {});
		}
		this.entries.clear();
	}

	getCachedBackendIds(): string[] {
		return [...this.entries.keys()];
	}

	private getSignature(config: AcpBridgeAdapterConfig): string {
		return JSON.stringify({
			id: config.id,
			name: config.name,
			command: config.command,
			args: config.args,
			version: config.version,
			registryAgentId: config.registryAgentId,
		});
	}
}
